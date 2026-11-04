<?php
declare(strict_types=1);
/* LatchHub – shared helpers for the Zoho WorkDrive connector. Not a public endpoint: api/.htaccess denies direct access. */

const LH_SESSION_HOURS = 10;

function out(int $code, array $data): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

/* ---------- config (kept ABOVE the web root, never in git) ---------- */
function cfg(): array {
  static $c = null;
  if ($c !== null) return $c;
  $docroot = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
  $paths = array_filter([$docroot ? dirname($docroot) . '/lh-config.php' : null, dirname(__DIR__, 2) . '/lh-config.php', dirname(__DIR__) . '/lh-config.php']);
  foreach ($paths as $p) { if (is_file($p)) { $c = require $p; return $c; } }
  out(500, ['error' => 'Server is not configured: lh-config.php was not found above the web root.']);
}

function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  $d = cfg()['db'];
  try {
    $pdo = new PDO($d['dsn'] ?? ('mysql:host=' . $d['host'] . ';dbname=' . $d['name'] . ';charset=utf8mb4'), $d['user'] ?? null, $d['pass'] ?? null,
      [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
  } catch (Throwable $e) { error_log('LatchHub db: ' . $e->getMessage()); out(500, ['error' => 'Database connection failed.']); }
  return $pdo;
}
function now(): string { return date('Y-m-d H:i:s'); }

function ensure_schema(): void {
  $x = db();
  $lite = $x->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';   /* sqlite is only used by the automated tests */
  $pk = $lite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT AUTO_INCREMENT PRIMARY KEY';
  $tail = $lite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
  $ix = fn(string $c) => $lite ? '' : ", INDEX($c)";
  $x->exec("CREATE TABLE IF NOT EXISTS lh_users (id $pk, email VARCHAR(190) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL, role VARCHAR(12) NOT NULL DEFAULT 'designer', pass_hash VARCHAR(255) NOT NULL, active TINYINT NOT NULL DEFAULT 1, created_at DATETIME NOT NULL)$tail");
  $x->exec("CREATE TABLE IF NOT EXISTS lh_attempts (id $pk, ip VARCHAR(64) NOT NULL, email VARCHAR(190) NOT NULL, ts INT NOT NULL" . $ix('ip') . $ix('email') . ")$tail");
  $x->exec("CREATE TABLE IF NOT EXISTS lh_kv (k VARCHAR(40) PRIMARY KEY, v TEXT NOT NULL, exp INT NOT NULL)$tail");
  $x->exec("CREATE TABLE IF NOT EXISTS lh_folders (client_key VARCHAR(40) PRIMARY KEY, zoho_id VARCHAR(80) NOT NULL, name VARCHAR(120) NOT NULL)$tail");
  $x->exec("CREATE TABLE IF NOT EXISTS lh_files (id $pk, zoho_id VARCHAR(80) NOT NULL, client_key VARCHAR(40) NOT NULL, name VARCHAR(255) NOT NULL, bytes BIGINT NOT NULL, orig_bytes BIGINT NOT NULL, method VARCHAR(40) NOT NULL, user_id INT NOT NULL, created_at DATETIME NOT NULL" . $ix('client_key') . ")$tail");
}

/* ---------- sessions & permissions ---------- */
function start_session(): void {
  if (session_status() === PHP_SESSION_ACTIVE) return;
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
  ini_set('session.use_strict_mode', '1');
  ini_set('session.gc_maxlifetime', (string)(LH_SESSION_HOURS * 3600));
  session_name('lhsess');
  session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
  session_start();
}
function current_user(): ?array {
  start_session();
  $id = $_SESSION['uid'] ?? null;
  if (!$id) return null;
  $st = db()->prepare('SELECT id,email,name,role,active FROM lh_users WHERE id=?');
  $st->execute([$id]);
  $u = $st->fetch();
  return ($u && (int)$u['active'] === 1) ? $u : null;
}
function check_csrf(): void {
  $h = $_SERVER['HTTP_X_LH_CSRF'] ?? '';
  if (empty($_SESSION['csrf']) || !hash_equals((string)$_SESSION['csrf'], (string)$h)) out(403, ['error' => 'Session check failed – reload the page and try again.']);
}
function require_method(string $m): void { if (($_SERVER['REQUEST_METHOD'] ?? '') !== $m) out(405, ['error' => 'Use ' . $m . '.']); }
function require_login(bool $write = false): array {
  $u = current_user();
  if (!$u) out(401, ['error' => 'Please sign in.']);
  if ($write) check_csrf();
  return $u;
}
function require_admin(bool $write = false): array {
  $u = require_login($write);
  if ($u['role'] !== 'admin') out(403, ['error' => 'Admins only.']);
  return $u;
}
function body_json(): array {
  $j = json_decode((string)file_get_contents('php://input'), true);
  return is_array($j) ? $j : [];
}

/* ---------- HTTP & Zoho ---------- */
function http(string $method, string $url, array $headers = [], $body = null, int $timeout = 60): array {
  $ch = curl_init($url);
  curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 15]);
  if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
  $res = curl_exec($ch);
  $st = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  if ($res === false) { error_log('LatchHub http: ' . curl_error($ch)); curl_close($ch); return [0, '']; }
  curl_close($ch);
  return [$st, (string)$res];
}
function zoho_token(bool $force = false): string {
  $z = cfg()['zoho'];
  if (!$force) {
    $r = db()->query("SELECT v,exp FROM lh_kv WHERE k='zoho_at'")->fetch();
    if ($r && (int)$r['exp'] > time() + 120) return $r['v'];
  }
  [$st, $b] = http('POST', rtrim($z['accounts'], '/') . '/oauth/v2/token', [], http_build_query(['grant_type' => 'refresh_token', 'client_id' => $z['client_id'], 'client_secret' => $z['client_secret'], 'refresh_token' => $z['refresh_token']]));
  $j = json_decode($b, true);
  if (empty($j['access_token'])) { error_log('LatchHub zoho token: ' . substr($b, 0, 200)); out(502, ['error' => 'Zoho authorisation failed.', 'detail' => is_array($j) ? ($j['error'] ?? 'unknown') : 'no response']); }
  db()->prepare('REPLACE INTO lh_kv (k,v,exp) VALUES (?,?,?)')->execute(['zoho_at', $j['access_token'], time() + (int)($j['expires_in'] ?? 3600)]);
  return $j['access_token'];
}
/* JSON call to the WorkDrive API; retries once with a fresh token */
function zoho_api(string $method, string $path, ?array $json = null, array $query = []): array {
  $z = cfg()['zoho'];
  $url = rtrim($z['api'], '/') . $path . ($query ? '?' . http_build_query($query) : '');
  for ($try = 0; $try < 2; $try++) {
    $h = ['Authorization: Zoho-oauthtoken ' . zoho_token($try === 1), 'Accept: application/vnd.api+json'];
    if ($json !== null) $h[] = 'Content-Type: application/vnd.api+json';
    [$st, $b] = http($method, $url, $h, $json !== null ? json_encode($json) : null);
    if ($st === 401 && $try === 0) continue;
    return [$st, json_decode($b, true) ?: [], $b];
  }
  return [0, [], ''];
}
function pick_id(array $j): ?string {
  foreach ([$j['data']['id'] ?? null, $j['data'][0]['id'] ?? null, $j['data']['attributes']['resource_id'] ?? null, $j['data'][0]['attributes']['resource_id'] ?? null, $j['resourceId'] ?? null] as $v) { if (is_string($v) && $v !== '') return $v; }
  return null;
}
function norm_item(array $d): array {
  $a = $d['attributes'] ?? [];
  $size = $a['storage_info']['size_in_bytes'] ?? ($a['storage_info']['size'] ?? ($a['size'] ?? null));
  $isFolder = (($a['type'] ?? '') === 'folder') || !empty($a['is_folder']);
  return ['id' => (string)($d['id'] ?? ''), 'name' => (string)($a['name'] ?? ($a['display_attr_name'] ?? '')), 'folder' => $isFolder, 'ext' => (string)($a['extn'] ?? ''), 'size' => is_numeric($size) ? (int)$size : null, 'modified' => (string)($a['modified_time'] ?? '')];
}
function zoho_list(string $folderId, int $cap = 500): array {
  $items = [];
  for ($off = 0; $off < $cap; $off += 50) {
    [$st, $j] = zoho_api('GET', '/files/' . rawurlencode($folderId) . '/files', null, ['page' => ['limit' => 50, 'offset' => $off]]);
    if ($st !== 200) { if ($off === 0) out(502, ['error' => 'Could not list the Zoho folder.', 'status' => $st]); break; }
    $page = $j['data'] ?? [];
    foreach ($page as $d) $items[] = norm_item($d);
    if (count($page) < 50) break;
  }
  return $items;
}

/* ---------- clients ↔ Zoho folders ---------- */
function valid_client_key(string $k): bool { return (bool)preg_match('/^[A-Za-z0-9_-]{3,40}$/', $k); }
function safe_name(string $n, string $fallback = 'file'): string {
  $n = trim(preg_replace('/[\\\\\/:*?"<>|\x00-\x1F]+/u', '-', $n) ?? '');
  $n = trim($n, " .-");
  if (function_exists('mb_substr')) $n = mb_substr($n, 0, 120); else $n = substr($n, 0, 120);
  return $n === '' ? $fallback : $n;
}
function client_folder(string $key, string $name, bool $create = true): ?string {
  $st = db()->prepare('SELECT zoho_id FROM lh_folders WHERE client_key=?');
  $st->execute([$key]);
  if ($r = $st->fetch()) return $r['zoho_id'];
  $root = cfg()['zoho']['root_folder_id'];
  $fname = safe_name($name, $key);
  foreach (zoho_list($root) as $it) { if ($it['folder'] && strcasecmp($it['name'], $fname) === 0) { db()->prepare('REPLACE INTO lh_folders (client_key,zoho_id,name) VALUES (?,?,?)')->execute([$key, $it['id'], $fname]); return $it['id']; } }
  if (!$create) return null;
  [$s, $j, $raw] = zoho_api('POST', '/files', ['data' => ['attributes' => ['parent_id' => $root, 'name' => $fname], 'type' => 'files']]);
  $id = pick_id($j);
  if (!in_array($s, [200, 201], true) || !$id) { error_log('LatchHub create folder: ' . substr($raw, 0, 300)); out(502, ['error' => 'Could not create the client folder in Zoho.', 'status' => $s]); }
  db()->prepare('REPLACE INTO lh_folders (client_key,zoho_id,name) VALUES (?,?,?)')->execute([$key, $id, $fname]);
  return $id;
}
/* a file may only be served if it sits somewhere under the LatchHub root folder */
function is_under_root(string $fileId): bool {
  $root = cfg()['zoho']['root_folder_id'];
  $cur = $fileId;
  for ($i = 0; $i < 8; $i++) {
    [$s, $j] = zoho_api('GET', '/files/' . rawurlencode($cur));
    if ($s !== 200) return false;
    $p = $j['data']['attributes']['parent_id'] ?? '';
    if ($p === '' ) return false;
    if ($p === $root) return true;
    $cur = $p;
  }
  return false;
}

/* ---------- compression ---------- */
function shell_ok(): bool {
  $d = array_map('trim', explode(',', (string)ini_get('disable_functions')));
  return function_exists('exec') && function_exists('shell_exec') && !in_array('exec', $d, true) && !in_array('shell_exec', $d, true);
}
function gs_path(): string { return shell_ok() ? trim((string)@shell_exec('command -v gs 2>/dev/null')) : ''; }
function image_has_alpha($img): bool {
  $w = imagesx($img); $h = imagesy($img); $step = max(1, (int)floor(min($w, $h) / 40));
  for ($y = 0; $y < $h; $y += $step) for ($x = 0; $x < $w; $x += $step) { if (((imagecolorat($img, $x, $y) >> 24) & 0x7F) > 0) return true; }
  return false;
}
/* shrink a photo/design export: max 2560 px on the long side, JPEG q82 (PNG with transparency stays PNG) */
function compress_image(string $tmp, string $ext): ?array {
  if (!function_exists('imagecreatefromstring')) return null;
  $info = @getimagesize($tmp);
  if (!$info || $info[0] * $info[1] > 40000000) return null;
  $data = @file_get_contents($tmp);
  $img = $data === false ? false : @imagecreatefromstring($data);
  unset($data);
  if (!$img) return null;
  if (function_exists('imagepalettetotruecolor')) imagepalettetotruecolor($img);
  if (in_array($ext, ['jpg', 'jpeg'], true) && function_exists('exif_read_data')) {
    $ex = @exif_read_data($tmp); $rot = [3 => 180, 6 => -90, 8 => 90][$ex['Orientation'] ?? 1] ?? 0;
    if ($rot && ($r = imagerotate($img, $rot, 0))) { imagedestroy($img); $img = $r; }
  }
  $w = imagesx($img); $h = imagesy($img); $max = 2560; $resized = false;
  if (max($w, $h) > $max) { $s = $max / max($w, $h); if ($n = imagescale($img, (int)round($w * $s), (int)round($h * $s))) { imagedestroy($img); $img = $n; $resized = true; } }
  $outp = tempnam(sys_get_temp_dir(), 'lhc');
  if (in_array($ext, ['png', 'webp'], true) && image_has_alpha($img)) { imagesavealpha($img, true); imagepng($img, $outp, 9); $newExt = 'png'; }
  else {
    $bg = imagecreatetruecolor(imagesx($img), imagesy($img)); imagefill($bg, 0, 0, imagecolorallocate($bg, 255, 255, 255));
    imagecopy($bg, $img, 0, 0, 0, 0, imagesx($img), imagesy($img)); imagejpeg($bg, $outp, 82); imagedestroy($bg); $newExt = 'jpg';
  }
  imagedestroy($img);
  if (!$resized && filesize($outp) >= filesize($tmp) * 0.95) { @unlink($outp); return null; }
  return ['path' => $outp, 'ext' => $newExt, 'method' => 'image'];
}
function compress_pdf(string $tmp): ?array {
  $gs = gs_path();
  if ($gs === '') return null;
  $outp = tempnam(sys_get_temp_dir(), 'lhp');
  exec(escapeshellarg($gs) . ' -q -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dCompatibilityLevel=1.5 -dPDFSETTINGS=/ebook -dColorImageResolution=150 -dGrayImageResolution=150 -sOutputFile=' . escapeshellarg($outp) . ' ' . escapeshellarg($tmp) . ' 2>&1', $o, $rc);
  if ($rc !== 0 || !is_file($outp) || filesize($outp) < 1000 || filesize($outp) >= filesize($tmp) * 0.95) { @unlink($outp); return null; }
  return ['path' => $outp, 'ext' => 'pdf', 'method' => 'pdf-ghostscript'];
}
