<?php
declare(strict_types=1);
/* GET api/download.php?id=<zoho file id>[&dl=1]  – streams a file that lives under the LatchHub folder; nothing else in the Zoho account is reachable. */
require __DIR__ . '/_lib.php';
require_method('GET');
require_login();
session_write_close();
$id = (string)($_GET['id'] ?? '');
if (!preg_match('/^[A-Za-z0-9]{10,80}$/', $id)) out(400, ['error' => 'Invalid file id.']);
[$s, $info] = zoho_api('GET', '/files/' . rawurlencode($id));
if ($s !== 200) out(404, ['error' => 'File not found.']);
if (!is_under_root($id)) out(403, ['error' => 'That file is outside the LatchHub folder.']);
$name = safe_name((string)($info['data']['attributes']['name'] ?? 'download'), 'download');
$ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
$types = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif', 'svg' => 'image/svg+xml', 'pdf' => 'application/pdf', 'mp4' => 'video/mp4', 'mov' => 'video/quicktime'];
$inline = isset($types[$ext]) && empty($_GET['dl']);
$ctype = $types[$ext] ?? 'application/octet-stream';
$url = rtrim(cfg()['zoho']['download'], '/') . '/' . rawurlencode($id);
$status = 0; $sent = false;
set_time_limit(0);
while (ob_get_level()) ob_end_clean();
$ch = curl_init($url);
curl_setopt_array($ch, [CURLOPT_HTTPHEADER => ['Authorization: Zoho-oauthtoken ' . zoho_token()], CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3, CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 0,
  CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$status) { if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) $status = (int)$m[1]; return strlen($h); },
  CURLOPT_WRITEFUNCTION => function ($c, $d) use (&$status, &$sent, $ctype, $name, $inline, $ext) {
    if ($status !== 200) return strlen($d);
    if (!$sent) {
      header('Content-Type: ' . $ctype);
      header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . "; filename=\"" . str_replace('"', '', $name) . "\"; filename*=UTF-8''" . rawurlencode($name));
      header('X-Content-Type-Options: nosniff');
      header('Cache-Control: private, max-age=300');
      if ($ext === 'svg') header("Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'");
      $sent = true;
    }
    echo $d; flush();
    return strlen($d);
  }]);
curl_exec($ch);
curl_close($ch);
if (!$sent) out(502, ['error' => 'Zoho did not return the file.', 'status' => $status]);
