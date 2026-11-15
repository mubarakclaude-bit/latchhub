<?php
declare(strict_types=1);
/*
 File manager uploads – any size, resumable. See api/_fm.php for how the bytes travel.
   POST ?action=start            JSON {client, client_name, folder?, path?, name, size, last_modified}
                                 → {token, piece, received, mode}. An unfinished upload of the same file to the same place is continued, not restarted.
   POST ?action=piece&token=…&offset=N   raw bytes (one piece) → {received}
   GET  ?action=status&token=…   → {state, received, id…}
   POST ?action=finish&token=…   → {ok, id, name, size}   (safe to repeat)
   POST ?action=cancel&token=…
*/
require __DIR__ . '/_lib.php';
require __DIR__ . '/_fm.php';
$action = (string)($_GET['action'] ?? '');
$isGet = $action === 'status';
require_method($isGet ? 'GET' : 'POST');
$user = require_login(!$isGet);
session_write_close();   /* two files can go up side by side: do not hold the session lock */
fm_cleanup_old();

/* one upload at a time may touch a given upload's pieces */
function fm_lock(string $name) { $fh = fopen(fm_spool_base() . '/.lock-' . substr(md5($name), 0, 16), 'c'); if ($fh) flock($fh, LOCK_EX); return $fh; }

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

  $lock = fm_lock('client:' . $key);   /* files of one dropped folder start one after another: the same new folder is never created twice */
  $cf = client_folder($key, $clientName, true);
  $base = (string)($in['folder'] ?? '');
  if ($base === '' || $base === $cf) $base = $cf;
  elseif (fm_trail($cf, $base) === null) out(403, ['error' => 'That folder is not inside this client\'s folder (it may have been deleted in WorkDrive). Refresh the list.']);
  $folder = $rel !== '' ? ensure_path($base, $rel, true, 8) : $base;

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
      out(502, ['error' => 'Zoho did not open an upload session for "' . $name . '" (HTTP ' . $s . ' ' . zoho_reason($raw) . ').', 'status' => $s]);
    }
  }
  $pieceMax = fm_piece_max(); $piece = $pieceMax;
  if ($chunk > 0) { $n = (int)ceil($chunk / $pieceMax); while ($chunk % $n !== 0) $n++; $piece = intdiv($chunk, $n); }   /* pieces add up exactly to one Zoho part */
  $token = bin2hex(random_bytes(16)); $now = gmdate('Y-m-d H:i:s');
  db()->prepare('INSERT INTO lh_uploads (token,user_id,client_key,client_name,folder_id,rel_path,name,size,last_mod,mode,piece,chunk_size,zoho_sent,zoho_upload_id,state,file_id,error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)')
    ->execute([$token, (int)$user['id'], $key, $clientName, $folder, substr($rel, 0, 500), $name, $size, $lastMod, $mode, $piece, $chunk, $zid, 'open', '', '', $now, $now]);
  @unlink(fm_spool($token));
  out(200, ['token' => $token, 'state' => 'open', 'received' => 0, 'size' => $size, 'piece' => $piece, 'mode' => $mode, 'folder' => $folder]);
}

$u = fm_load((string)($_GET['token'] ?? ''), $user);

if ($action === 'status') out(200, fm_state($u));

if ($action === 'cancel') {
  $lock = fm_lock($u['token']);
  if ($u['state'] === 'open') { @unlink(fm_spool($u['token'])); fm_touch($u['token'], ['state' => 'cancelled']); }
  out(200, ['ok' => true]);
}

if ($action === 'piece') {
  if ($u['state'] !== 'open') out(409, fm_state($u) + ['error' => 'This upload is already ' . $u['state'] . '.']);
  $lock = fm_lock($u['token']);
  $u = fm_load($u['token'], $user);
  $size = (int)$u['size']; $piece = (int)$u['piece'];
  if ($u['mode'] === 'chunk' && ($why = fm_forward_part($u, false)) !== '') out(502, ['error' => $why, 'received' => fm_received($u)]);
  $recv = fm_received($u);
  $off = (int)($_GET['offset'] ?? -1); $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
  if ($off >= 0 && $off < $recv && $off + $len <= $recv) out(200, ['received' => $recv, 'duplicate' => true]);   /* sent twice (the first reply was lost): already have it */
  if ($off !== $recv) out(409, ['error' => 'Piece out of order.', 'received' => $recv]);
  if ($len < 1 || $len > $piece) out(400, ['error' => 'A piece must be between 1 byte and ' . $piece . ' bytes.', 'received' => $recv]);
  if ($off + $len > $size) out(400, ['error' => 'More bytes than the file has.', 'received' => $recv]);
  if ($off + $len < $size && $len !== $piece) out(400, ['error' => 'Every piece except the last must be exactly ' . $piece . ' bytes.', 'received' => $recv]);
  $buf = fm_spool($u['token']); $before = fm_buf_size($u['token']);
  $src = fopen('php://input', 'rb'); $dst = fopen($buf, 'ab');
  if (!$src || !$dst) out(500, ['error' => 'The server could not store the piece (no writable temporary folder).', 'received' => $recv]);
  $n = stream_copy_to_stream($src, $dst); fclose($src);
  if ($n !== $len) { ftruncate($dst, $before); fclose($dst); out(400, ['error' => 'The piece arrived incomplete (' . (int)$n . ' of ' . $len . ' bytes) – it will be sent again.', 'received' => $recv]); }
  fclose($dst);
  fm_touch($u['token']);
  if ($u['mode'] === 'chunk' && ($why = fm_forward_part($u, false)) !== '') out(502, ['error' => $why, 'received' => fm_received($u)]);
  out(200, ['received' => fm_received($u)]);
}

if ($action === 'finish') {
  @set_time_limit(0); ignore_user_abort(true);   /* the last step can take a few minutes for a big file: it keeps going even if the browser stops waiting */
  $lock = fm_lock($u['token']);
  $u = fm_load($u['token'], $user);
  if ($u['state'] === 'done') out(200, ['ok' => true, 'id' => $u['file_id'], 'name' => $u['name'], 'size' => (int)$u['size']]);
  if ($u['state'] !== 'open') out(409, fm_state($u) + ['error' => 'This upload is ' . $u['state'] . '.']);
  $recv = fm_received($u);
  if ($recv !== (int)$u['size']) out(409, ['error' => 'Not all pieces have arrived yet.', 'received' => $recv]);
  fm_touch($u['token'], ['error' => '']);
  $folder = $u['folder_id']; $name = $u['name']; $buf = fm_spool($u['token']); $id = ''; $fail = '';
  if ($u['mode'] === 'single') {
    [$s, $raw, $j] = zoho_upload($folder, $buf, $name);
    if (in_array($s, [200, 201], true)) $id = pick_id($j) ?? ''; else $fail = 'HTTP ' . $s . ' ' . zoho_reason($raw);
  } elseif ($u['mode'] === 'stream') {
    [$s, $raw, $j] = zoho_stream_upload($folder, $buf, $name, $u['token']);
    if (in_array($s, [200, 201], true)) $id = pick_id($j) ?? ''; else $fail = 'HTTP ' . $s . ' ' . zoho_reason($raw);
  } else {
    $fail = fm_forward_part($u, true);
    if ($fail === '') {
      [$s, $j, $raw] = zoho_session_commit($u['zoho_upload_id'], $folder, $name);
      if ($s === 200) $id = pick_id($j) ?? '';
      elseif ($s !== 412) $fail = 'Zoho did not complete the file (HTTP ' . $s . ' ' . zoho_reason($raw) . ')';   /* 412 = already completed: the earlier reply was lost */
    }
  }
  if ($fail === '' && $id === '') $id = zoho_find_id($folder, $name);   /* Zoho stored it but did not say its id: find it by name */
  if ($fail === '' && $id === '') $fail = 'Zoho accepted the file but it did not appear in the folder';
  if ($fail !== '') {
    error_log('LatchHub fm finish ' . $u['token'] . ': ' . $fail);
    fm_touch($u['token'], ['error' => substr($fail, 0, 300)]);
    log_activity('client_error', $user, ['client_id' => $u['client_key'], 'client_name' => $u['client_name'], 'details' => 'File manager upload of ' . $name . ' failed: ' . $fail]);
    out(502, ['error' => 'Could not store "' . $name . '" in Zoho: ' . $fail . '. Your pieces are kept here – press Retry.', 'received' => fm_received($u)]);
  }
  @unlink($buf);
  fm_touch($u['token'], ['state' => 'done', 'file_id' => $id]);
  db()->prepare('INSERT INTO lh_files (zoho_id,client_key,name,bytes,orig_bytes,method,user_id,created_at) VALUES (?,?,?,?,?,?,?,?)')->execute([$id, $u['client_key'], $name, (int)$u['size'], (int)$u['size'], 'files-' . $u['mode'], (int)$user['id'], now()]);
  $mb = (int)$u['size'] >= 1073741824 ? round((int)$u['size'] / 1073741824, 2) . ' GB' : round((int)$u['size'] / 1048576, 2) . ' MB';
  log_activity('file_uploaded', $user, ['client_id' => $u['client_key'], 'client_name' => $u['client_name'], 'details' => $name . ' · ' . $mb . ' · Files' . ($u['rel_path'] !== '' ? ' › ' . $u['rel_path'] : '')]);
  out(200, ['ok' => true, 'id' => $id, 'name' => $name, 'size' => (int)$u['size']]);
}

out(400, ['error' => 'Unknown action.']);
