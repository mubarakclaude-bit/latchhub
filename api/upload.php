<?php
declare(strict_types=1);
/*
 POST multipart: client (brand id), client_name, kind, file
   kind = creative  → images are shrunk (max 2560 px, JPEG q82; PNG with transparency stays PNG)
   kind = auto      → images AND PDFs are compressed (default)
   kind = asset     → stored exactly as sent (logo masters, fonts, source files)
 PDFs are compressed with Ghostscript when the server has it; otherwise stored as sent and the reply says so.
*/
require __DIR__ . '/_lib.php';
require_method('POST');
$user = require_login(true);
$cfg = cfg();
$key = (string)($_POST['client'] ?? '');
if (!valid_client_key($key)) out(400, ['error' => 'Missing or invalid client.']);
$k = (string)($_POST['kind'] ?? 'auto');
$kind = in_array($k, ['creative', 'auto', 'asset'], true) ? $k : 'auto';
$f = $_FILES['file'] ?? null;
if (!$f || ($f['error'] ?? 4) !== UPLOAD_ERR_OK) {
  $why = [1 => 'larger than the server upload limit', 2 => 'larger than the form limit', 3 => 'only partly uploaded', 4 => 'no file received'][$f['error'] ?? 4] ?? 'upload failed';
  out(400, ['error' => 'The file was not accepted: ' . $why . '.']);
}
$maxMb = (int)($cfg['max_upload_mb'] ?? 200);
if ($f['size'] > $maxMb * 1048576) out(413, ['error' => 'File is larger than ' . $maxMb . ' MB.']);
$orig = safe_name(basename((string)$f['name']));
$ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
$allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'pdf', 'ai', 'eps', 'psd', 'indd', 'zip', 'mp4', 'mov', 'ttf', 'otf', 'woff', 'woff2', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt'];
if (!in_array($ext, $allowed, true)) out(415, ['error' => 'File type ".' . $ext . '" is not allowed.']);
$tmp = $f['tmp_name'];
if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true) && !@getimagesize($tmp)) out(415, ['error' => 'That image could not be read.']);

/* compress */
$send = $tmp; $sendName = $orig; $method = 'none'; $cleanup = null;
if ($kind !== 'asset') {
  $r = null;
  if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp'], true)) $r = compress_image($tmp, $ext);
  elseif ($ext === 'pdf' && $kind === 'auto') $r = compress_pdf($tmp);
  if ($r) { $send = $r['path']; $cleanup = $r['path']; $method = $r['method']; $sendName = preg_replace('/\.[^.]+$/', '', $orig) . '.' . $r['ext']; }
  elseif ($ext === 'pdf' && $kind === 'auto') $method = gs_path() === '' ? 'pdf-not-compressed (no Ghostscript on this server)' : 'pdf-already-small';
}
$bytes = (int)filesize($send);

/* send to the client's Zoho folder */
$folder = client_folder($key, (string)($_POST['client_name'] ?? $key), true);
$z = $cfg['zoho'];
$resp = null;
for ($try = 0; $try < 2 && !$resp; $try++) {
  $ch = curl_init(rtrim($z['api'], '/') . '/upload');
  curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 900, CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_HTTPHEADER => ['Authorization: Zoho-oauthtoken ' . zoho_token($try === 1), 'Accept: application/vnd.api+json'],
    CURLOPT_POSTFIELDS => ['parent_id' => $folder, 'filename' => rawurlencode($sendName), 'override-name-exist' => 'false', 'content' => new CURLFile($send, 'application/octet-stream', $sendName)]]);
  $raw = curl_exec($ch); $st = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  if ($st === 401 && $try === 0) continue;
  $resp = [$st, (string)$raw];
}
if ($cleanup) @unlink($cleanup);
[$st, $raw] = $resp ?: [0, ''];
$j = json_decode($raw, true) ?: [];
if (!in_array($st, [200, 201], true)) { error_log('LatchHub upload: ' . $st . ' ' . substr($raw, 0, 300)); out(502, ['error' => 'Zoho did not accept the upload.', 'status' => $st]); }
$id = pick_id($j) ?? '';
db()->prepare('INSERT INTO lh_files (zoho_id,client_key,name,bytes,orig_bytes,method,user_id,created_at) VALUES (?,?,?,?,?,?,?,?)')->execute([$id, $key, $sendName, $bytes, (int)$f['size'], substr($method, 0, 40), (int)$user['id'], now()]);
if ($id === '') error_log('LatchHub upload: no file id in Zoho reply: ' . substr($raw, 0, 300));
out(200, ($id === '' ? ['warning' => 'Zoho accepted the upload but did not return a file id. Check the client folder in WorkDrive.'] : []) + ['ok' => true, 'id' => $id, 'name' => $sendName, 'original_bytes' => (int)$f['size'], 'stored_bytes' => $bytes, 'compression' => $method, 'saved_percent' => $f['size'] > 0 ? (int)round((1 - $bytes / $f['size']) * 100) : 0]);
