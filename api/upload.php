<?php
declare(strict_types=1);
/*
 POST multipart: client (brand id), client_name, kind, file, and optionally folder (e.g. "Brand assets/Logos", created inside the client folder)
   kind = creative  → images are shrunk (max 2560 px, JPEG q82; PNG with transparency stays PNG)
   kind = auto      → images AND PDFs are compressed (default)
   kind = asset     → stored exactly as sent (logo masters, fonts, source files)
 PDFs are compressed with Ghostscript when the server has it; otherwise stored as sent and the reply says so.
*/
require __DIR__ . '/_lib.php';
require_method('POST');
$user = require_login(true);
@set_time_limit(600);   /* big brand books: do not let the host's default script time limit cut the transfer to Zoho short */
/* a file bigger than post_max_size arrives as an empty request – say so instead of a confusing 'missing client' */
if (empty($_POST) && empty($_FILES) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
  out(413, ['error' => 'The file is larger than this server allows (post_max_size=' . ini_get('post_max_size') . ', upload_max_filesize=' . ini_get('upload_max_filesize') . '). Raise both in hPanel → PHP Configuration (64M is a good value).']);
}
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
$allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'pdf', 'ai', 'eps', 'psd', 'indd', 'zip', 'mp4', 'm4v', 'mov', 'ttf', 'otf', 'woff', 'woff2', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt'];
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
$subPath = trim((string)($_POST['folder'] ?? ''));
if ($subPath !== '') $folder = ensure_path($folder, $subPath, true);
[$st, $raw, $j] = zoho_upload($folder, $send, $sendName);
if ($cleanup) @unlink($cleanup);
if (!in_array($st, [200, 201], true)) { error_log('LatchHub upload: ' . $st . ' ' . substr($raw, 0, 300)); out(502, ['error' => 'Zoho did not accept the upload (HTTP ' . $st . ').', 'status' => $st, 'detail' => substr($raw, 0, 300)]); }
$id = pick_id($j) ?? '';
if ($id === '') $id = zoho_find_id($folder, $sendName);
db()->prepare('INSERT INTO lh_files (zoho_id,client_key,name,bytes,orig_bytes,method,user_id,created_at) VALUES (?,?,?,?,?,?,?,?)')->execute([$id, $key, $sendName, $bytes, (int)$f['size'], substr($method, 0, 40), (int)$user['id'], now()]);
if ($id === '') error_log('LatchHub upload: no file id in Zoho reply: ' . substr($raw, 0, 300));
out(200, ($id === '' ? ['warning' => 'Zoho accepted the upload but did not return a file id. Check the client folder in WorkDrive.'] : []) + ['ok' => true, 'id' => $id, 'name' => $sendName, 'original_bytes' => (int)$f['size'], 'stored_bytes' => $bytes, 'compression' => $method, 'saved_percent' => $f['size'] > 0 ? (int)round((1 - $bytes / $f['size']) * 100) : 0]);
