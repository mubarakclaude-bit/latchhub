<?php
declare(strict_types=1);
/*
 Hands out the files that only signed-in people may see: client logos and brand books under assets/, and the client data file.
 .htaccess sends  /assets/…  and  /brand-hub-data.json  here, so a stranger who guesses a file address gets "Please sign in" instead of the logo.
 (assets/latchhub/ – the logo on the sign-in page itself – stays public.)
*/
require __DIR__ . '/api/_lib.php';

function deny(int $code, string $msg): void { http_response_code($code); header('Content-Type: text/plain; charset=utf-8'); header('Cache-Control: no-store'); echo $msg; exit; }

$f = (string)($_GET['f'] ?? '');
if ($f === '' || strpos($f, "\0") !== false) deny(400, 'Bad request.');
$f = str_replace('\\', '/', $f);
$isData = ($f === 'brand-hub-data.json');
if (!$isData && strpos($f, 'assets/') !== 0) deny(404, 'Not found.');
foreach (explode('/', $f) as $seg) { if ($seg === '' || $seg[0] === '.') deny(404, 'Not found.'); }   // no "..", no hidden files, no double slashes
$types = ['svg' => 'image/svg+xml', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'gif' => 'image/gif', 'pdf' => 'application/pdf', 'json' => 'application/json',
  'ttf' => 'font/ttf', 'otf' => 'font/otf', 'woff' => 'font/woff', 'woff2' => 'font/woff2', 'mp4' => 'video/mp4', 'm4v' => 'video/mp4', 'mov' => 'video/quicktime', 'ai' => 'application/octet-stream', 'eps' => 'application/postscript', 'psd' => 'application/octet-stream', 'zip' => 'application/zip'];
$ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
if (!isset($types[$ext])) deny(403, 'This file type is not served.');
$base = realpath(__DIR__);
$path = realpath(__DIR__ . '/' . $f);
if (!$base || !$path || strpos($path, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($path)) deny(404, 'Not found.');

$public = strpos($f, 'assets/latchhub/') === 0;
if (!$public && cfg_path() !== null) {            // before the server is configured (no lh-config.php) nothing can be signed in, so files are served as before
  start_session(true);                            // read-only: does not lock the session while a page loads dozens of images
  if (empty($_SESSION['uid'])) deny(401, 'Please sign in.');
}
$etag = '"' . md5($f . '|' . filemtime($path) . '|' . filesize($path)) . '"';
header('ETag: ' . $etag);
header('Cache-Control: ' . ($public ? 'public' : 'private') . ', max-age=3600');
header('X-Content-Type-Options: nosniff');
if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
header('Content-Type: ' . $types[$ext]);
header('Content-Length: ' . filesize($path));
if ($ext === 'svg') header("Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'");
readfile($path);
