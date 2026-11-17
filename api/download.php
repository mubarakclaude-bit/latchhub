<?php
declare(strict_types=1);
/* GET api/download.php?id=<zoho file id>[&dl=1]  – streams a file that lives under the LatchHub folder; nothing else in the Zoho account is reachable.
   Files are kept in a small disk cache (next to lh-config.php) so pages with many logos stay fast and Zoho is not hit for every image. */
require __DIR__ . '/_lib.php';
require_method('GET');
require_login();
session_write_close();
/* a file that is complete on this server but still on its way to Zoho: served from here, so nobody has to wait */
if (isset($_GET['up'])) {
  require __DIR__ . '/_fm.php';
  $u = preg_match('/^[a-f0-9]{32}$/', (string)$_GET['up']) ? fm_get((string)$_GET['up']) : null;
  if (!$u || $u['state'] === 'done') { if ($u && $u['file_id']) { header('Location: download.php?id=' . rawurlencode($u['file_id']) . (empty($_GET['dl']) ? '' : '&dl=1')); exit; } out(404, ['error' => 'File not found.']); }
  $f = fm_spool_base() . '/' . $u['token'] . '/part-0';
  if ($u['state'] !== 'queued' || $u['mode'] === 'chunk' || !is_file($f)) out(404, ['error' => 'This file is being saved – try again in a minute.']);
  $nm = safe_name($u['name'], 'download');
  header('Content-Type: application/octet-stream'); header('X-Content-Type-Options: nosniff'); header('Cache-Control: private, no-store');
  header('Content-Disposition: attachment; filename="' . str_replace('"', '', $nm) . "\"; filename*=UTF-8''" . rawurlencode($nm));
  header('Content-Length: ' . filesize($f));
  @set_time_limit(0); while (ob_get_level()) ob_end_clean(); readfile($f); exit;
}
$id = (string)($_GET['id'] ?? '');
if (!preg_match('/^[A-Za-z0-9]{10,80}$/', $id)) out(400, ['error' => 'Invalid file id.']);

/* is it one of ours? (uploaded through LatchHub, or already verified) – otherwise check the folder chain in Zoho once */
$st = db()->prepare('SELECT name FROM lh_files WHERE zoho_id=? LIMIT 1');
$st->execute([$id]);
$known = $st->fetch();
if ($known) { $name = safe_name((string)$known['name'], 'download'); }
else {
  [$s, $info] = zoho_api('GET', '/files/' . rawurlencode($id));
  if ($s !== 200) out(404, ['error' => 'File not found.']);
  if (!is_under_root($id)) out(403, ['error' => 'That file is outside the LatchHub folder.']);
  $name = safe_name((string)($info['data']['attributes']['name'] ?? 'download'), 'download');
  db()->prepare('INSERT INTO lh_files (zoho_id,client_key,name,bytes,orig_bytes,method,user_id,created_at) VALUES (?,?,?,?,?,?,?,?)')->execute([$id, '-', $name, 0, 0, 'verified', 0, now()]);
}
$ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
$types = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif', 'svg' => 'image/svg+xml', 'pdf' => 'application/pdf', 'mp4' => 'video/mp4', 'm4v' => 'video/mp4', 'mov' => 'video/quicktime'];
$inline = isset($types[$ext]) && empty($_GET['dl']);
$ctype = $types[$ext] ?? 'application/octet-stream';
$sendHeaders = function (?int $len) use ($ctype, $name, $inline, $ext) {
  header('Content-Type: ' . $ctype);
  header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . "; filename=\"" . str_replace('"', '', $name) . "\"; filename*=UTF-8''" . rawurlencode($name));
  header('X-Content-Type-Options: nosniff');
  header('Cache-Control: private, max-age=600');
  if ($len !== null) header('Content-Length: ' . $len);
  if ($ext === 'svg') header("Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'");
};
set_time_limit(0);
while (ob_get_level()) ob_end_clean();

/* cache hit */
$cp = cfg_path();
$cacheDir = $cp ? dirname($cp) . '/lh-cache' : null;
$cacheFile = $cacheDir ? $cacheDir . '/' . $id : null;
if ($cacheFile && is_file($cacheFile)) { $sendHeaders((int)filesize($cacheFile)); readfile($cacheFile); exit; }

/* stream from Zoho, saving a copy for next time */
$status = 0; $sent = false; $tee = null; $bytes = 0; $zlen = null;
if ($cacheDir && (is_dir($cacheDir) || @mkdir($cacheDir, 0700, true))) $tee = @fopen($cacheFile . '.part' . getmypid(), 'wb') ?: null;
$errBody = '';
for ($try = 0; $try < 2; $try++) {   /* a refused login is retried once with a fresh one */
$status = 0; $zlen = null;
$ch = curl_init(rtrim(cfg()['zoho']['download'], '/') . '/' . rawurlencode($id));
curl_setopt_array($ch, [CURLOPT_HTTPHEADER => ['Authorization: Zoho-oauthtoken ' . zoho_token($try === 1)], CURLOPT_FOLLOWLOCATION => true, CURLOPT_UNRESTRICTED_AUTH => true, CURLOPT_MAXREDIRS => 3, CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 0,
  CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$status, &$zlen) { if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) { $status = (int)$m[1]; $zlen = null; } elseif (preg_match('#^content-length:\s*(\d+)#i', $h, $m)) $zlen = (int)$m[1]; return strlen($h); },
  CURLOPT_WRITEFUNCTION => function ($c, $d) use (&$status, &$sent, &$tee, &$bytes, &$zlen, &$errBody, $sendHeaders) {
    if ($status !== 200) { if (strlen($errBody) < 400) $errBody .= substr($d, 0, 400); return strlen($d); }
    if (!$sent) { $sendHeaders($zlen); $sent = true; }   /* pass Zoho's size on, so the browser shows download progress for big files */
    echo $d; flush();
    $bytes += strlen($d);
    if ($tee) { if ($bytes > 60000000) { fclose($tee); $tee = null; } else fwrite($tee, $d); }
    return strlen($d);
  }]);
curl_exec($ch);
curl_close($ch);
if ($sent || !in_array($status, [400, 401], true)) break;
}
if ($tee) {
  fclose($tee);
  $part = $cacheFile . '.part' . getmypid();
  if ($sent && $bytes > 0) @rename($part, $cacheFile); else @unlink($part);
}
if (!$sent) {
  $hint = zoho_scope_hint($errBody, 'ZohoFiles.files.READ (downloads)');
  if ($hint !== '') error_log('LatchHub download: Zoho key lacks the download scope');
  out(502, ['error' => 'Zoho did not return the file.' . $hint, 'status' => $status]);
}
