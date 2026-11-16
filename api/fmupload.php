<?php
declare(strict_types=1);
/*
 File manager uploads – any size, resumable, several pieces at once. See api/_fm.php for how the bytes travel.
   POST ?action=start            JSON {client, client_name, folder?, path?, name, size, last_modified}
                                 → {token, piece, have, received, mode}. An unfinished upload of the same file to the same place is continued, not restarted.
   POST ?action=piece&token=…&offset=N   raw bytes of one piece (any order) → {received}
   GET  ?action=status&token=…   → {state, received, have…}
   POST ?action=finish&token=…   → {ok, state}. The designer is done here: delivery to Zoho continues on the server
                                   (state "queued" until it is in Zoho, then "done"); failures are retried automatically.
   POST ?action=cancel&token=…
*/
require __DIR__ . '/_lib.php';
require __DIR__ . '/_fm.php';
$action = (string)($_GET['action'] ?? '');
$isGet = $action === 'status';
require_method($isGet ? 'GET' : 'POST');
$user = require_login(!$isGet);
session_write_close();   /* several pieces go up side by side: do not hold the session lock */
fm_cleanup_old();

if ($action === 'start') {
  $in = body_json();
  $key = (string)($in['client'] ?? '');
  if (!valid_client_key($key)) out(400, ['error' => 'Missing or invalid client.']);
  $clientName = substr(trim((string)($in['client_name'] ?? $key)), 0, 190);
  $name = safe_name(basename(str_replace('\\', '/', (string)($in['name'] ?? ''))), '');
  if ($name === '') out(400, ['error' => 'The file needs a name.']);
  $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
  if (!in_array($ext, FM_EXT, true)) out(415, ['error' => $ext === '' ? '"' . $name . '" has no file extension, so it cannot be stored.' : 'Files of type ".' . $ext . '" cannot be stored here.']);
  $size = (int)($in['size'] ?? -1);
  if ($size < 1) out(400, ['error' => '"' . $name . '" is empty.']);
  if ($size > fm_max_bytes()) out(413, ['error' => '"' . $name . '" is larger than ' . round(fm_max_bytes() / 1073741824) . ' GB.']);
  $lastMod = (int)($in['last_modified'] ?? 0);
  $rel = trim(str_replace('\\', '/', (string)($in['path'] ?? '')), '/');   /* sub-folders of a dropped folder, e.g. "Shoot/Day 1" */

  $lk = fopen(fm_spool_base() . '/.lock-' . substr(md5('client:' . $key), 0, 16), 'c'); if ($lk) flock($lk, LOCK_EX);   /* the same new folder is never created twice */
  $cf = client_folder($key, $clientName, true);
  $base = (string)($in['folder'] ?? '');
  if ($base === '' || $base === $cf) $base = $cf;
  elseif (fm_trail($cf, $base) === null) out(403, ['error' => 'That folder is not inside this client\'s folder (it may have been deleted in WorkDrive). Refresh the list.']);
  $folder = $rel !== '' ? ensure_path($base, $rel, true, 8) : $base;
  if ($lk) { flock($lk, LOCK_UN); fclose($lk); }

  /* continue an unfinished upload of the same file to the same place */
  $q = db()->prepare("SELECT * FROM lh_uploads WHERE user_id=? AND client_key=? AND folder_id=? AND name=? AND size=? AND last_mod=? AND state='open' ORDER BY updated_at DESC LIMIT 1");
  $q->execute([(int)$user['id'], $key, $folder, $name, $size, $lastMod]);
  if ($u = $q->fetch()) { fm_touch($u['token']); out(200, fm_state($u) + ['resumed' => fm_received($u) > 0]); }

  $mode = $size <= fm_single_max() ? 'single' : ($size <= fm_chunk_min() ? 'stream' : 'chunk');
  $chunk = 0; $zid = '';
  if ($mode === 'chunk') {
    [$s, $j, $raw] = zoho_session_create($folder, $name, $size);
    $d = isset($j['upload_id']) ? $j : ($j['data']['attributes'] ?? ($j['data'][0]['attributes'] ?? $j));
    $zid = (string)($d['upload_id'] ?? ''); $chunk = (int)($d['chunk_size'] ?? 0);
    if ($s !== 200 || $zid === '' || $chunk < 1048576) {
      error_log('LatchHub fm session: ' . $s . ' ' . substr($raw, 0, 300));
      out(502, ['error' => 'Zoho did not open an upload session for "' . $name . '" (HTTP ' . $s . ' ' . zoho_reason($raw) . ').' . zoho_scope_hint($raw, 'WorkDrive.files.CREATE'), 'status' => $s]);
    }
  }
  $pieceMax = fm_piece_max(); $piece = $pieceMax;
  if ($chunk > 0) { $n = (int)ceil($chunk / $pieceMax); while ($chunk % $n !== 0) $n++; $piece = intdiv($chunk, $n); }   /* pieces add up exactly to one Zoho part */
  $token = bin2hex(random_bytes(16)); $now = gmdate('Y-m-d H:i:s');
  db()->prepare('INSERT INTO lh_uploads (token,user_id,client_key,client_name,folder_id,rel_path,name,size,last_mod,mode,piece,chunk_size,zoho_sent,zoho_upload_id,state,file_id,error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)')
    ->execute([$token, (int)$user['id'], $key, $clientName, $folder, substr($rel, 0, 500), $name, $size, $lastMod, $mode, $piece, $chunk, $zid, 'open', '', '', $now, $now]);
  out(200, fm_state(fm_get($token)) + ['folder' => $folder]);
}

$u = fm_load((string)($_GET['token'] ?? ''), $user);

if ($action === 'status') out(200, fm_state($u));

if ($action === 'cancel') {
  $lock = fm_worker_lock($u['token'], true);
  $u = fm_get($u['token']);
  if ($u && $u['state'] === 'open') { fm_touch($u['token'], ['state' => 'cancelled']); rrmdir(fm_spool_base() . '/' . $u['token']); }
  fm_worker_unlock($lock);
  out(200, ['ok' => true]);
}

if ($action === 'piece') {
  if ($u['state'] !== 'open') out(409, fm_state($u) + ['error' => 'This upload is already ' . $u['state'] . '.']);
  $size = (int)$u['size']; $piece = (int)$u['piece'];
  $off = (int)($_GET['offset'] ?? -1); $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
  if ($off < 0 || $off >= $size || $off % $piece !== 0) out(400, ['error' => 'A piece must start at a multiple of ' . $piece . ' bytes.', 'received' => fm_received($u)]);
  $idx = intdiv($off, $piece);
  $want = (int)min($piece, $size - $off);
  if ($len !== $want) out(400, ['error' => 'This piece must be exactly ' . $want . ' bytes.', 'received' => fm_received($u)]);
  if (fm_got($u)[$idx] === '1') out(200, ['received' => fm_received($u), 'duplicate' => true]);   /* sent twice (the first reply was lost): already have it */
  $ps = fm_part_size($u); $p = intdiv($off, $ps);
  if ($u['mode'] === 'chunk' && $p - intdiv((int)$u['zoho_sent'], $ps) >= FM_PARTS_AHEAD) {   /* Zoho is behind: ask the browser to wait instead of filling this server's disk */
    header('Retry-After: 5'); out(503, ['error' => 'Waiting for Zoho to catch up.', 'retry_after' => 5, 'received' => fm_received($u)]);
  }
  $file = fm_part_file($u, $p);
  $src = fopen('php://input', 'rb'); $dst = fopen($file, 'c+b');
  if (!$src || !$dst) out(500, ['error' => 'The server could not store the piece (no writable temporary folder).', 'received' => fm_received($u)]);
  fseek($dst, $off - $p * $ps);
  $n = stream_copy_to_stream($src, $dst); fclose($src); fflush($dst); fclose($dst);
  if ($n !== $len) out(400, ['error' => 'The piece arrived incomplete (' . (int)$n . ' of ' . $len . ' bytes) – it will be sent again.', 'received' => fm_received($u)]);
  fm_mark($u, $idx);
  fm_touch($u['token']);
  $reply = ['received' => fm_received($u)];
  /* over 1 GB: a complete part goes on to Zoho – after answering, so the browser does not wait for it */
  if ($u['mode'] === 'chunk' && fm_part_complete($u, intdiv((int)$u['zoho_sent'], $ps))) {
    $bg = out_then_continue(200, $reply);
    $lock = fm_worker_lock($u['token'], false);
    if ($lock) { $u = fm_get($u['token']); if ($u['state'] === 'open') { $why = fm_forward_ready($u); if ($why !== '') fm_touch($u['token'], ['error' => substr($why, 0, 300)]); } fm_worker_unlock($lock); }
    if ($bg) exit;
  }
  out(200, $reply);
}

if ($action === 'finish') {
  if ($u['state'] === 'done') out(200, ['ok' => true, 'state' => 'done', 'id' => $u['file_id'], 'name' => $u['name'], 'size' => (int)$u['size']]);
  if ($u['state'] === 'queued') out(200, ['ok' => true, 'state' => 'queued', 'name' => $u['name'], 'size' => (int)$u['size']]);
  if ($u['state'] !== 'open') out(409, fm_state($u) + ['error' => 'This upload is ' . $u['state'] . '.']);
  $got = fm_got($u);
  if (strpos($got, '0') !== false) {
    $missing = []; for ($i = 0, $n = strlen($got); $i < $n && count($missing) < 50; $i++) if ($got[$i] === '0') $missing[] = $i;
    out(409, ['error' => 'Not all pieces have arrived yet.', 'received' => fm_received($u), 'have' => $got, 'missing' => $missing]);
  }
  fm_touch($u['token'], ['state' => 'queued', 'attempts' => 0, 'error' => '']);
  $u = fm_get($u['token']);
  $reply = ['ok' => true, 'state' => 'queued', 'name' => $u['name'], 'size' => (int)$u['size']];
  /* the designer is finished: delivering to Zoho happens after answering (or, where the host cannot do that, before) */
  if (out_then_continue(200, $reply)) { fm_transfer($u, true); exit; }
  if (empty(cfg()['fm']['defer']) && fm_transfer($u, true)) { $u = fm_get($u['token']); out(200, ['ok' => true, 'state' => 'done', 'id' => $u['file_id'], 'name' => $u['name'], 'size' => (int)$u['size']]); }
  out(200, $reply);
}

out(400, ['error' => 'Unknown action.']);
