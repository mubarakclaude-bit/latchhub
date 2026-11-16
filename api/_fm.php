<?php
declare(strict_types=1);
/*
 LatchHub file manager – shared helpers. Not a public endpoint (api/.htaccess denies files starting with "_").

 How a big file reaches Zoho without size trouble:
   the browser sends it in small pieces (8 MB) that each fit comfortably in one request to this host;
   this server keeps at most ONE Zoho-sized part on disk and forwards it to Zoho as soon as it is complete.
 Which Zoho route is used depends on the size (these are Zoho's own rules):
   up to 250 MB   → normal upload                          (one request to Zoho when the last piece arrives)
   250 MB – 1 GB  → "Upload Large File" stream upload       (one streamed request to Zoho when the last piece arrives)
   over 1 GB      → chunk session: create → 64/128 MB parts in order → commit   (only one part is ever on this server)
 Every piece is acknowledged with the byte count received so far, so an interrupted upload continues where it stopped.
*/

const FM_PIECE_MAX = 8 * 1048576;
const FM_PARTS_AHEAD = 4;   /* over 1 GB: how many Zoho parts may wait on this server before the browser is asked to slow down */
const FM_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'heic', 'heif', 'tif', 'tiff', 'bmp', 'avif', 'raw', 'cr2', 'cr3', 'nef', 'arw', 'dng',
  'pdf', 'ai', 'eps', 'psd', 'psb', 'indd', 'idml', 'aep', 'prproj', 'fig', 'sketch', 'xd', 'afdesign', 'afphoto', 'cdr',
  'mp4', 'm4v', 'mov', 'webm', 'avi', 'mkv', 'mp3', 'wav', 'aac', 'm4a', 'ttf', 'otf', 'woff', 'woff2',
  'doc', 'docx', 'ppt', 'pptx', 'key', 'xls', 'xlsx', 'csv', 'txt', 'rtf', 'md', 'zip', 'rar', '7z', 'gz', 'tar', 'json', 'xml', 'glb', 'gltf', 'obj', 'fbx', 'blend', 'c4d', 'lottie'];

function fm_cfg(string $k, int $default): int { $v = cfg()['fm'][$k] ?? null; return is_numeric($v) ? (int)$v : $default; }
function fm_single_max(): int { return fm_cfg('single_max', 250 * 1000 * 1000); }      /* Zoho: normal upload "up to 250MB" */
function fm_chunk_min(): int { return fm_cfg('chunk_min', 1024 * 1048576); }          /* Zoho: chunk sessions only for files over 1 GB */
function fm_max_bytes(): int { return fm_cfg('max_gb', 50) * 1073741824; }           /* Zoho's own per-file limit depends on the plan */
function fm_piece_max(): int { return max(65536, min(fm_cfg('piece', FM_PIECE_MAX), 64 * 1048576)); }

/* the regional Zoho upload server ("Upload Server API"): https://upload.zoho.in for zohoapis.in, and so on */
function zoho_upload_host(): string {
  $z = cfg()['zoho'];
  if (!empty($z['upload'])) return rtrim((string)$z['upload'], '/');
  $h = strtolower((string)parse_url((string)$z['api'], PHP_URL_HOST));
  $map = ['zohoapis.com' => 'https://upload.zoho.com', 'zohoapis.in' => 'https://upload.zoho.in', 'zohoapis.eu' => 'https://upload.zoho.eu', 'zohoapis.com.au' => 'https://upload.zoho.com.au',
    'zohoapis.jp' => 'https://upload.zoho.jp', 'zohoapis.com.cn' => 'https://upload.zoho.com.cn', 'zohoapis.ca' => 'https://upload.zohocloud.ca', 'zohoapis.sa' => 'https://files.zoho.sa', 'zohoapis.ae' => 'https://files.zoho.ae'];
  foreach ($map as $suffix => $host) { if ($h === $suffix || substr($h, -strlen('.' . $suffix)) === '.' . $suffix) return $host; }
  return 'https://upload.zoho.com';
}

/* POST a file (or the first $len bytes of it) as the raw request body; retries once with a fresh token */
function zoho_post_file(string $url, string $path, int $len, array $headers, int $timeout = 1800): array {
  for ($try = 0; $try < 2; $try++) {
    $fh = fopen($path, 'rb');
    if (!$fh) return [0, 'could not read the temporary file', []];
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_UPLOAD => true, CURLOPT_CUSTOMREQUEST => 'POST', CURLOPT_INFILE => $fh, CURLOPT_INFILESIZE => $len, CURLOPT_RETURNTRANSFER => true,
      CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => $timeout,
      CURLOPT_HTTPHEADER => array_merge(['Authorization: Zoho-oauthtoken ' . zoho_token($try === 1), 'Accept: application/vnd.api+json', 'Content-Type: application/octet-stream', 'Expect:'], $headers)]);
    $raw = curl_exec($ch); $st = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch); fclose($fh);
    if ($raw === false) { error_log('LatchHub zoho_post_file: ' . $err); return [0, 'connection to Zoho failed: ' . $err, []]; }
    if ($st === 401 && $try === 0 && strpos((string)$raw, 'D92') === false) continue;   /* token expired (not an upload-specific refusal) */
    return [$st, (string)$raw, json_decode((string)$raw, true) ?: []];
  }
  return [0, '', []];
}
/* Zoho's short reason for a refusal, e.g. "D9233 Chunk uploaded out of sequence" */
function zoho_reason(string $raw): string {
  $j = json_decode($raw, true);
  if (is_array($j) && !empty($j['errors'][0])) { $e = $j['errors'][0]; return trim((string)($e['id'] ?? '') . ' ' . (string)($e['title'] ?? '')); }
  return substr(preg_replace('/\s+/', ' ', $raw) ?? '', 0, 200);
}

/* 250 MB – 1 GB: one streamed request (Zoho splits it on its side) */
function zoho_stream_upload(string $folderId, string $path, string $name, string $uploadId): array {
  return zoho_post_file(zoho_upload_host() . '/workdrive-api/v1/stream/upload', $path, (int)filesize($path),
    ['x-filename: ' . rawurlencode($name), 'x-parent_id: ' . $folderId, 'upload-id: ' . $uploadId, 'x-streammode: 1', 'x-override-name-exist: false']);
}
/* over 1 GB: chunk session */
function zoho_session_create(string $folderId, string $name, int $size): array {
  return zoho_api('POST', '/uploadsession/create', null, ['size' => (string)$size, 'file_name' => $name, 'parent_id' => $folderId, 'name_conflict' => 'rename']);
}
function zoho_session_progress(string $uploadId): array { return zoho_api('GET', '/uploadsession', null, ['upload_id' => $uploadId]); }
function zoho_session_chunk(string $uploadId, string $path, int $start, int $len, int $total): array {
  return zoho_post_file(zoho_upload_host() . '/workdrive-api/v1/stream/upload', $path, $len,
    ['upload-id: ' . $uploadId, 'Content-Range: bytes ' . $start . '-' . ($start + $len - 1) . '/' . $total, 'x-streammode: 1'], 900);
}
function zoho_session_commit(string $uploadId, string $folderId, string $name): array {
  return zoho_api('POST', '/uploadsession/commit', null, ['upload_id' => $uploadId, 'parent_id' => $folderId, 'file_name' => $name, 'name_conflict' => 'rename']);
}

/* ---------- where pieces wait on this server ----------
 Each upload has a folder lh-cache/up/<token>/ with
   got      one character per piece: 1 = arrived (pieces may arrive in any order, several at once)
   part-N   the bytes of Zoho part N (files up to 1 GB: one part = the whole file)
 Over 1 GB, a part is sent to Zoho as soon as all its pieces are here, and then deleted. */
function fm_spool_base(): string {
  $cp = cfg_path();
  $b = ($cp ? dirname($cp) . '/lh-cache' : sys_get_temp_dir() . '/lh-chunks') . '/up';
  if (!is_dir($b)) @mkdir($b, 0700, true);
  return $b;
}
function fm_dir(string $token): string { $d = fm_spool_base() . '/' . $token; if (!is_dir($d)) @mkdir($d, 0700, true); return $d; }
function fm_part_size(array $u): int { return $u['mode'] === 'chunk' ? (int)$u['chunk_size'] : (int)$u['size']; }
function fm_npieces(array $u): int { return max(1, (int)ceil((int)$u['size'] / max(1, (int)$u['piece']))); }
function fm_pieces_per_part(array $u): int { return max(1, intdiv(fm_part_size($u), (int)$u['piece'])); }
function fm_nparts(array $u): int { return max(1, (int)ceil((int)$u['size'] / max(1, fm_part_size($u)))); }
function fm_part_file(array $u, int $p): string { return fm_dir($u['token']) . '/part-' . $p; }
function fm_part_len(array $u, int $p): int { $ps = fm_part_size($u); return (int)min($ps, (int)$u['size'] - $p * $ps); }
function fm_got(array $u): string {
  $f = fm_spool_base() . '/' . $u['token'] . '/got'; clearstatcache(true, $f);
  $n = fm_npieces($u); $g = is_file($f) ? (string)file_get_contents($f) : '';
  return strlen($g) === $n ? $g : str_pad(substr($g, 0, $n), $n, '0');
}
function fm_mark(array $u, int $idx): void {
  $fh = fopen(fm_dir($u['token']) . '/got', 'c+'); if (!$fh) return;
  flock($fh, LOCK_EX);
  $n = fm_npieces($u); $g = (string)stream_get_contents($fh); $g = str_pad(substr($g, 0, $n), $n, '0'); $g[$idx] = '1';
  ftruncate($fh, 0); rewind($fh); fwrite($fh, $g); fflush($fh); flock($fh, LOCK_UN); fclose($fh);
}
function fm_received(array $u): int {
  if (in_array($u['state'], ['queued', 'done'], true)) return (int)$u['size'];
  $g = fm_got($u); $n = strlen($g); $piece = (int)$u['piece'];
  $b = substr_count($g, '1') * $piece;
  if ($n > 0 && $g[$n - 1] === '1') $b -= $n * $piece - (int)$u['size'];
  return $b;
}
function fm_part_complete(array $u, int $p, ?string $g = null): bool {
  $g = $g ?? fm_got($u); $k = fm_pieces_per_part($u);
  $seg = substr($g, $p * $k, $k);
  return $seg !== '' && strpos($seg, '0') === false;
}
/* uploads nobody came back to for 3 days: remove their pieces (Zoho chunk sessions expire after about 7 days anyway) */
function fm_cleanup_old(): void {
  if (mt_rand(1, 20) !== 1) return;
  try {
    $old = gmdate('Y-m-d H:i:s', time() - 3 * 86400);
    $st = db()->prepare("SELECT token FROM lh_uploads WHERE state='open' AND updated_at < ?"); $st->execute([$old]);
    foreach ($st->fetchAll() as $r) { rrmdir(fm_spool_base() . '/' . $r['token']); db()->prepare("UPDATE lh_uploads SET state='expired' WHERE token=?")->execute([$r['token']]); }
    db()->prepare("DELETE FROM lh_uploads WHERE state IN ('done','cancelled','expired') AND updated_at < ?")->execute([gmdate('Y-m-d H:i:s', time() - 30 * 86400)]);
  } catch (Throwable $e) { error_log('LatchHub fm cleanup: ' . $e->getMessage()); }
}
function fm_get(string $token): ?array { $st = db()->prepare('SELECT * FROM lh_uploads WHERE token=?'); $st->execute([$token]); return $st->fetch() ?: null; }
function fm_load(string $token, array $user): array {
  if (!preg_match('/^[a-f0-9]{32}$/', $token)) out(400, ['error' => 'Bad upload id.']);
  $u = fm_get($token);
  if (!$u || (int)$u['user_id'] !== (int)$user['id']) out(404, ['error' => 'This upload is not known (it may have expired). Start it again.']);
  return $u;
}
function fm_touch(string $token, array $set = []): void {
  $set['updated_at'] = gmdate('Y-m-d H:i:s');
  $cols = implode(',', array_map(fn($k) => $k . '=?', array_keys($set)));
  db()->prepare('UPDATE lh_uploads SET ' . $cols . ' WHERE token=?')->execute(array_merge(array_values($set), [$token]));
}
function fm_state(array $u): array {
  $open = $u['state'] === 'open';
  return ['token' => $u['token'], 'state' => $u['state'], 'received' => fm_received($u), 'size' => (int)$u['size'], 'piece' => (int)$u['piece'], 'mode' => $u['mode'],
    'have' => $open ? fm_got($u) : null, 'id' => $u['file_id'] ?: null];
}
/* one worker at a time talks to Zoho for a given upload */
function fm_worker_lock(string $token, bool $wait) { $fh = fopen(fm_spool_base() . '/.fwd-' . $token, 'c'); if (!$fh) return null; if (!flock($fh, $wait ? LOCK_EX : LOCK_EX | LOCK_NB)) { fclose($fh); return null; } return $fh; }
function fm_worker_unlock($fh): void { if ($fh) { flock($fh, LOCK_UN); fclose($fh); } }

/* over 1 GB: send every complete part that is next in line. Returns '' or the reason it stopped. */
function fm_forward_ready(array &$u): string {
  if ($u['mode'] !== 'chunk') return '';
  $ps = fm_part_size($u); $n = fm_nparts($u);
  while (true) {
    if ((int)$u['zoho_sent'] >= (int)$u['size']) return '';   /* every part is in Zoho */
    $p = intdiv((int)$u['zoho_sent'], $ps);
    if ($p >= $n || !fm_part_complete($u, $p)) return '';
    $len = fm_part_len($u, $p); $start = (int)$u['zoho_sent']; $file = fm_part_file($u, $p);
    clearstatcache(true, $file);
    if (!is_file($file) || filesize($file) < $len) return 'part ' . ($p + 1) . ' is incomplete on this server';
    [$st, $raw] = zoho_session_chunk($u['zoho_upload_id'], $file, $start, $len, (int)$u['size']);
    $ok = $st === 200;
    if (!$ok) {   /* the part may have arrived although the reply was lost (e.g. "same chunk uploaded more than once"): ask Zoho how far it got */
      [$pst, $pj] = zoho_session_progress($u['zoho_upload_id']);
      $got = (int)($pj['received_bytes'] ?? ($pj['data']['attributes']['received_bytes'] ?? -1));
      if ($pst === 200 && $got >= $start + $len) $ok = true;
    }
    if (!$ok) { $why = 'Zoho did not accept part ' . ($p + 1) . ' (HTTP ' . $st . ' ' . zoho_reason($raw) . ')'; error_log('LatchHub fm: ' . $why); return $why; }
    @unlink($file);
    $u['zoho_sent'] = $start + $len;
    fm_touch($u['token'], ['zoho_sent' => $u['zoho_sent']]);
  }
}

/* every byte is here: deliver the file to Zoho. Returns true when it is in Zoho. Failures are kept for a later retry. */
function fm_transfer(array $u, bool $wait = true): bool {
  $lock = fm_worker_lock($u['token'], $wait);
  if (!$lock) return false;
  try {
    $u = fm_get($u['token']) ?? $u;
    if ($u['state'] === 'done') return true;
    if ($u['state'] !== 'queued') return false;
    $folder = $u['folder_id']; $name = $u['name']; $id = ''; $fail = '';
    if ($u['mode'] === 'chunk') {
      $fail = fm_forward_ready($u);
      if ($fail === '' && (int)$u['zoho_sent'] < (int)$u['size']) $fail = 'not every part has reached Zoho yet';
      if ($fail === '') {
        [$s, $j, $raw] = zoho_session_commit($u['zoho_upload_id'], $folder, $name);
        if ($s === 200) $id = pick_id($j) ?? '';
        elseif ($s !== 412) $fail = 'Zoho did not complete the file (HTTP ' . $s . ' ' . zoho_reason($raw) . ')';   /* 412 = already completed: the earlier reply was lost */
      }
    } else {
      $file = fm_part_file($u, 0);
      if (!is_file($file)) $fail = 'the file is no longer on this server';
      else {
        [$s, $raw, $j] = $u['mode'] === 'single' ? zoho_upload($folder, $file, $name) : zoho_stream_upload($folder, $file, $name, $u['token']);
        if (in_array($s, [200, 201], true)) $id = pick_id($j) ?? ''; else $fail = 'HTTP ' . $s . ' ' . zoho_reason($raw);
      }
    }
    if ($fail === '' && $id === '') $id = zoho_find_id($folder, $name);   /* stored, but Zoho did not say its id: find it by name */
    if ($fail === '' && $id === '') $fail = 'Zoho accepted the file but it did not appear in the folder';
    if ($fail !== '') {
      $a = (int)($u['attempts'] ?? 0) + 1;
      fm_touch($u['token'], ['attempts' => $a, 'error' => substr($fail, 0, 300)]);
      error_log('LatchHub fm transfer ' . $u['token'] . ' (attempt ' . $a . '): ' . $fail);
      if ($a === 3) log_activity('client_error', ['id' => 0, 'name' => 'LatchHub (background)', 'role' => 'system'], ['client_id' => $u['client_key'], 'client_name' => $u['client_name'], 'details' => $name . ' is still not in Zoho after 3 tries (' . $fail . '). It is kept on the server and retried automatically.']);
      return false;
    }
    fm_touch($u['token'], ['state' => 'done', 'file_id' => $id, 'error' => '']);
    rrmdir(fm_spool_base() . '/' . $u['token']);
    db()->prepare('INSERT INTO lh_files (zoho_id,client_key,name,bytes,orig_bytes,method,user_id,created_at) VALUES (?,?,?,?,?,?,?,?)')->execute([$id, $u['client_key'], $name, (int)$u['size'], (int)$u['size'], 'files-' . $u['mode'], (int)$u['user_id'], now()]);
    $by = db()->prepare('SELECT id,name,role FROM lh_users WHERE id=?'); $by->execute([(int)$u['user_id']]);
    $mb = (int)$u['size'] >= 1073741824 ? round((int)$u['size'] / 1073741824, 2) . ' GB' : round((int)$u['size'] / 1048576, 2) . ' MB';
    log_activity('file_uploaded', $by->fetch() ?: ['id' => (int)$u['user_id'], 'name' => '?', 'role' => ''], ['client_id' => $u['client_key'], 'client_name' => $u['client_name'], 'details' => $name . ' · ' . $mb . ' · Files' . ($u['rel_path'] !== '' ? ' › ' . $u['rel_path'] : '')]);
    return true;
  } finally { fm_worker_unlock($lock); }
}

/* background delivery: files that are complete here but not yet in Zoho (and complete uploads whose browser went away before saying "finish").
   Runs after answering requests, and from api/cron.php. */
function fm_pump(int $max = 3, int $seconds = 120): int {
  $t0 = time(); $n = 0;
  try {
    $rows = db()->query("SELECT * FROM lh_uploads WHERE state IN ('queued','open') ORDER BY updated_at LIMIT 50")->fetchAll();
    foreach ($rows as $u) {
      if ($n >= $max || time() - $t0 > $seconds) break;
      $age = time() - (int)strtotime($u['updated_at'] . ' UTC');
      if ($u['state'] === 'open') {
        if ($age < fm_cfg('orphan_after', 120) || fm_received($u) !== (int)$u['size']) continue;   /* every piece arrived but nobody said finish */
        fm_touch($u['token'], ['state' => 'queued']); $u['state'] = 'queued'; $age = 0;
      } elseif ((int)$u['attempts'] > 0 && $age < min(3600, fm_cfg('retry_base', 60) * (int)$u['attempts'])) continue;   /* wait a little longer after each failed try */
      if (fm_transfer($u, false)) $n++;
    }
  } catch (Throwable $e) { error_log('LatchHub fm pump: ' . $e->getMessage()); }
  return $n;
}

/* ---------- folders: only folders inside the client's own Zoho folder may be listed or changed ---------- */
function zid_ok(string $id): bool { return (bool)preg_match('/^[A-Za-z0-9]{10,80}$/', $id); }
/* the path from the client folder down to $folderId ([[id,name], …]), or null when $folderId is not inside it */
function fm_trail(string $clientFolder, string $folderId): ?array {
  if ($folderId === $clientFolder) return [];
  if (!zid_ok($folderId)) return null;
  $k = 'ft:' . substr(md5($clientFolder . '|' . $folderId), 0, 30);
  $q = db()->prepare('SELECT v,exp FROM lh_kv WHERE k=?'); $q->execute([$k]);
  if (($r = $q->fetch()) && (int)$r['exp'] > time()) { $t = json_decode($r['v'], true); if (is_array($t)) return $t; }
  $trail = []; $cur = $folderId;
  for ($i = 0; $i < 12; $i++) {
    [$s, $j] = zoho_api('GET', '/files/' . rawurlencode($cur));
    if ($s !== 200) return null;
    $a = $j['data']['attributes'] ?? [];
    if (in_array((string)($a['status'] ?? '1'), ['51', '61'], true) || !empty($a['is_trashed'])) return null;
    if ($i === 0 && !((($a['type'] ?? '') === 'folder') || !empty($a['is_folder']))) return null;
    array_unshift($trail, ['id' => $cur, 'name' => (string)($a['name'] ?? '')]);
    $p = (string)($a['parent_id'] ?? '');
    if ($p === $clientFolder) { db()->prepare('REPLACE INTO lh_kv (k,v,exp) VALUES (?,?,?)')->execute([$k, json_encode($trail), time() + 600]); return $trail; }
    if ($p === '' || $p === cfg()['zoho']['root_folder_id']) return null;
    $cur = $p;
  }
  return null;
}
/* the item (file or folder) with $id, if it sits directly in $folderId */
function fm_item_in(string $folderId, string $id): ?array {
  if (!zid_ok($id)) return null;
  [$s, $j] = zoho_api('GET', '/files/' . rawurlencode($id));
  if ($s !== 200 || (string)($j['data']['attributes']['parent_id'] ?? '') !== $folderId) return null;
  return norm_item($j['data']);
}
/* Zoho file ids the client's brand page uses (logos, fonts, brand book…): those are removed from the brand page, not here */
function fm_brand_ids(string $key): array {
  try { $st = db()->prepare('SELECT json FROM lh_brands WHERE id=?'); $st->execute([$key]); $r = $st->fetch(); return $r ? zoho_ids_in((string)$r['json']) : []; }
  catch (Throwable $e) { return []; }
}
