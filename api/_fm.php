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

/* ---------- where pieces wait on this server ---------- */
function fm_spool_base(): string {
  $cp = cfg_path();
  $b = ($cp ? dirname($cp) . '/lh-cache' : sys_get_temp_dir() . '/lh-chunks') . '/up';
  if (!is_dir($b)) @mkdir($b, 0700, true);
  return $b;
}
function fm_spool(string $token): string { return fm_spool_base() . '/' . $token; }
function fm_buf_size(string $token): int { $f = fm_spool($token); clearstatcache(true, $f); return is_file($f) ? (int)filesize($f) : 0; }
/* uploads nobody came back to for 3 days: remove their pieces (Zoho chunk sessions expire after about 7 days anyway) */
function fm_cleanup_old(): void {
  if (mt_rand(1, 20) !== 1) return;
  try {
    $old = gmdate('Y-m-d H:i:s', time() - 3 * 86400);
    $st = db()->prepare("SELECT token FROM lh_uploads WHERE state='open' AND updated_at < ?"); $st->execute([$old]);
    foreach ($st->fetchAll() as $r) { @unlink(fm_spool($r['token'])); db()->prepare("UPDATE lh_uploads SET state='expired' WHERE token=?")->execute([$r['token']]); }
    db()->prepare("DELETE FROM lh_uploads WHERE state<>'open' AND updated_at < ?")->execute([gmdate('Y-m-d H:i:s', time() - 30 * 86400)]);
  } catch (Throwable $e) { error_log('LatchHub fm cleanup: ' . $e->getMessage()); }
}
function fm_received(array $u): int { return (int)$u['zoho_sent'] + fm_buf_size($u['token']); }
function fm_load(string $token, array $user): array {
  if (!preg_match('/^[a-f0-9]{32}$/', $token)) out(400, ['error' => 'Bad upload id.']);
  $st = db()->prepare('SELECT * FROM lh_uploads WHERE token=?'); $st->execute([$token]);
  $u = $st->fetch();
  if (!$u || (int)$u['user_id'] !== (int)$user['id']) out(404, ['error' => 'This upload is not known (it may have expired). Start it again.']);
  return $u;
}
function fm_touch(string $token, array $set = []): void {
  $set['updated_at'] = gmdate('Y-m-d H:i:s');
  $cols = implode(',', array_map(fn($k) => $k . '=?', array_keys($set)));
  db()->prepare('UPDATE lh_uploads SET ' . $cols . ' WHERE token=?')->execute(array_merge(array_values($set), [$token]));
}
function fm_state(array $u): array {
  return ['token' => $u['token'], 'state' => $u['state'], 'received' => fm_received($u), 'size' => (int)$u['size'], 'piece' => (int)$u['piece'], 'mode' => $u['mode'], 'id' => $u['file_id'] ?: null, 'error' => $u['error'] ?: null];
}

/* over 1 GB: when a whole Zoho part is waiting here, send it. Returns '' on success or the reason it failed. */
function fm_forward_part(array &$u, bool $final): string {
  $len = fm_buf_size($u['token']);
  if ($len === 0) return '';
  if (!$final && $len < (int)$u['chunk_size']) return '';
  $start = (int)$u['zoho_sent'];
  [$st, $raw] = zoho_session_chunk($u['zoho_upload_id'], fm_spool($u['token']), $start, $len, (int)$u['size']);
  $ok = $st === 200;
  if (!$ok) {   /* the part may have arrived although the reply was lost (e.g. "same chunk uploaded more than once"): ask Zoho how far it got */
    [$ps, $pj] = zoho_session_progress($u['zoho_upload_id']);
    $got = (int)($pj['received_bytes'] ?? ($pj['data']['attributes']['received_bytes'] ?? -1));
    if ($ps === 200 && $got >= $start + $len) $ok = true;
  }
  if (!$ok) { $why = 'Zoho did not accept part ' . (intdiv($start, max(1, (int)$u['chunk_size'])) + 1) . ' (HTTP ' . $st . ' ' . zoho_reason($raw) . ')'; error_log('LatchHub fm: ' . $why); return $why; }
  @unlink(fm_spool($u['token']));
  $u['zoho_sent'] = $start + $len;
  fm_touch($u['token'], ['zoho_sent' => $u['zoho_sent']]);
  return '';
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
