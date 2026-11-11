<?php
declare(strict_types=1);
/* LatchHub – shared helpers for the Zoho WorkDrive connector. Not a public endpoint: api/.htaccess denies direct access. */

const LH_SESSION_HOURS = 10;

/* never print PHP errors to visitors; answer API calls with a clear JSON message instead */
ini_set('display_errors', '0');
set_exception_handler(function (Throwable $e) {
  error_log('LatchHub: ' . $e->getMessage());
  out(500, ['error' => 'Server error. If this is a new install, open the setup page first.']);
});

function out(int $code, array $data): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

/* ---------- config (kept ABOVE the web root, never in git) ---------- */
function cfg_path(): ?string {
  $docroot = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
  $paths = array_filter([$docroot ? dirname($docroot) . '/lh-config.php' : null, dirname(__DIR__, 2) . '/lh-config.php', dirname(__DIR__) . '/lh-config.php']);
  foreach ($paths as $p) { if (is_file($p)) return $p; }
  return null;
}
function cfg(): array {
  static $c = null;
  if ($c !== null) return $c;
  $p = cfg_path();
  if (!$p) out(500, ['error' => 'Server is not configured: lh-config.php was not found above the web root.']);
  $c = require $p;
  return $c;
}
function pdo_connect(): PDO {
  $d = cfg()['db'];
  return new PDO($d['dsn'] ?? ('mysql:host=' . $d['host'] . ';dbname=' . $d['name'] . ';charset=utf8mb4'), $d['user'] ?? null, $d['pass'] ?? null,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
}
const LH_SCHEMA = 7;   /* bump when a table is added: installs created earlier are upgraded automatically on the next request */
function ensure_schema_once(PDO $x): void {
  try { $r = $x->query("SELECT v FROM lh_kv WHERE k='schema'")->fetch(); if ($r && (int)$r['v'] >= LH_SCHEMA) return; } catch (Throwable $e) { /* lh_kv itself may be missing */ }
  ensure_schema($x);
  $x->prepare('REPLACE INTO lh_kv (k,v,exp) VALUES (?,?,0)')->execute(['schema', (string)LH_SCHEMA]);
}
function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  try { $pdo = pdo_connect(); ensure_schema_once($pdo); }
  catch (Throwable $e) { error_log('LatchHub db: ' . $e->getMessage()); out(500, ['error' => 'Database connection failed.']); }
  return $pdo;
}
/* used by the login page so it can show a friendly message instead of JSON */
function db_available(): bool { try { pdo_connect(); return true; } catch (Throwable $e) { error_log('LatchHub db: ' . $e->getMessage()); return false; } }
function now(): string { return date('Y-m-d H:i:s'); }

function ensure_schema(?PDO $x = null): void {
  $x = $x ?? db();
  $lite = $x->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';   /* sqlite is only used by the automated tests */
  $pk = $lite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT AUTO_INCREMENT PRIMARY KEY';
  $tail = $lite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
  $ix = fn(string $c) => $lite ? '' : ", INDEX($c)";
  $x->exec("CREATE TABLE IF NOT EXISTS lh_users (id $pk, email VARCHAR(190) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL, role VARCHAR(12) NOT NULL DEFAULT 'designer', pass_hash VARCHAR(255) NOT NULL, active TINYINT NOT NULL DEFAULT 1, created_at DATETIME NOT NULL)$tail");
  $x->exec("CREATE TABLE IF NOT EXISTS lh_attempts (id $pk, ip VARCHAR(64) NOT NULL, email VARCHAR(190) NOT NULL, ts INT NOT NULL" . $ix('ip') . $ix('email') . ")$tail");
  $x->exec("CREATE TABLE IF NOT EXISTS lh_kv (k VARCHAR(40) PRIMARY KEY, v TEXT NOT NULL, exp INT NOT NULL)$tail");
  $x->exec("CREATE TABLE IF NOT EXISTS lh_folders (client_key VARCHAR(40) PRIMARY KEY, zoho_id VARCHAR(80) NOT NULL, name VARCHAR(120) NOT NULL)$tail");
  $x->exec("CREATE TABLE IF NOT EXISTS lh_brands (id VARCHAR(40) PRIMARY KEY, name VARCHAR(190) NOT NULL, json LONGTEXT NOT NULL, version INT NOT NULL DEFAULT 1, updated_by INT NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL)$tail");
  $x->exec("CREATE TABLE IF NOT EXISTS lh_deleted (id VARCHAR(40) PRIMARY KEY, name VARCHAR(190) NOT NULL, json LONGTEXT NOT NULL, folder_id VARCHAR(80) NOT NULL DEFAULT '', files LONGTEXT NOT NULL, deleted_by INT NOT NULL DEFAULT 0, deleted_at DATETIME NOT NULL)$tail");
  $x->exec("CREATE TABLE IF NOT EXISTS lh_activity (id $pk, at DATETIME NOT NULL, user_id INT NOT NULL DEFAULT 0, user_name VARCHAR(120) NOT NULL DEFAULT '', role VARCHAR(12) NOT NULL DEFAULT '', action VARCHAR(40) NOT NULL, client_id VARCHAR(40) NOT NULL DEFAULT '', client_name VARCHAR(190) NOT NULL DEFAULT '', details TEXT NOT NULL, ip VARCHAR(64) NOT NULL DEFAULT ''" . $ix('at') . $ix('user_id') . $ix('client_id') . $ix('action') . ")$tail");
  $x->exec("CREATE TABLE IF NOT EXISTS lh_pending (id $pk, zoho_id VARCHAR(80) NOT NULL, kind VARCHAR(12) NOT NULL, reason VARCHAR(255) NOT NULL, tries INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL)$tail");
  $x->exec("CREATE TABLE IF NOT EXISTS lh_files (id $pk, zoho_id VARCHAR(80) NOT NULL, client_key VARCHAR(40) NOT NULL, name VARCHAR(255) NOT NULL, bytes BIGINT NOT NULL, orig_bytes BIGINT NOT NULL, method VARCHAR(40) NOT NULL, user_id INT NOT NULL, created_at DATETIME NOT NULL" . $ix('client_key') . ")$tail");
}

/* ---------- sessions & permissions ---------- */
function start_session(bool $readonly = false): void {
  if (session_status() === PHP_SESSION_ACTIVE) return;
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
  ini_set('session.use_strict_mode', '1');
  ini_set('session.gc_maxlifetime', (string)(LH_SESSION_HOURS * 3600));
  session_name('lhsess');
  session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
  session_start($readonly ? ['read_and_close' => true] : []);
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

/* multipart upload of a local file into a Zoho folder; returns [http status, raw reply, decoded reply] */
function zoho_upload(string $folderId, string $path, string $name): array {
  $z = cfg()['zoho'];
  $resp = null;
  for ($try = 0; $try < 2 && !$resp; $try++) {
    $ch = curl_init(rtrim($z['api'], '/') . '/upload');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 900, CURLOPT_CONNECTTIMEOUT => 15,
      CURLOPT_HTTPHEADER => ['Authorization: Zoho-oauthtoken ' . zoho_token($try === 1), 'Accept: application/vnd.api+json'],
      CURLOPT_POSTFIELDS => ['parent_id' => $folderId, 'filename' => rawurlencode($name), 'override-name-exist' => 'false', 'content' => new CURLFile($path, 'application/octet-stream', $name)]]);
    $raw = curl_exec($ch); $st = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($st === 401 && $try === 0) continue;
    $resp = [$st, (string)$raw];
  }
  [$st, $raw] = $resp ?: [0, ''];
  return [$st, $raw, json_decode($raw, true) ?: []];
}
/* Zoho's upload reply shape is not documented well: when it carries no id, find the file we just stored by name */
function zoho_find_id(string $folderId, string $name): string {
  $base = pathinfo($name, PATHINFO_FILENAME); $id = '';
  foreach (zoho_list($folderId) as $it) { if (!$it['folder'] && $it['name'] === $name) return $it['id']; }
  foreach (zoho_list($folderId) as $it) { if (!$it['folder'] && strpos($it['name'], $base) === 0) $id = $it['id']; }
  return $id;
}

/* ---------- clients ↔ Zoho folders ---------- */
function valid_client_key(string $k): bool { return (bool)preg_match('/^[A-Za-z0-9_-]{3,40}$/', $k); }
function safe_name(string $n, string $fallback = 'file'): string {
  $n = trim(preg_replace('/[\\\\\/:*?"<>|\x00-\x1F]+/u', '-', $n) ?? '');
  $n = trim($n, " .-");
  if (function_exists('mb_substr')) $n = mb_substr($n, 0, 120); else $n = substr($n, 0, 120);
  return $n === '' ? $fallback : $n;
}
function create_folder(string $parentId, string $name): string {
  [$s, $j, $raw] = zoho_api('POST', '/files', ['data' => ['attributes' => ['parent_id' => $parentId, 'name' => $name], 'type' => 'files']]);
  $id = pick_id($j);
  if (!in_array($s, [200, 201], true) || !$id) { error_log('LatchHub create folder: ' . substr($raw, 0, 300)); out(502, ['error' => 'Could not create the folder in Zoho.', 'status' => $s]); }
  return $id;
}
/* Is a remembered Zoho folder still there (not deleted or trashed by hand in WorkDrive)? Checked at most every few minutes per folder. */
function folder_alive(string $id): bool {
  $ttl = (int)(cfg()['folder_check_ttl'] ?? 300);
  $k = 'fv:' . substr(md5($id), 0, 30);
  if ($ttl > 0) { $q = db()->prepare('SELECT exp FROM lh_kv WHERE k=?'); $q->execute([$k]); if (($row = $q->fetch()) && (int)$row['exp'] > time()) return true; }
  [$s, $j] = zoho_api('GET', '/files/' . rawurlencode($id));
  if ($s === 0) return true;                       /* Zoho unreachable right now: a network hiccup must not make us forget the folder */
  $a = $j['data']['attributes'] ?? [];
  $alive = $s === 200 && !in_array((string)($a['status'] ?? '1'), ['51', '61', 'trashed', 'deleted'], true) && empty($a['trashed']) && empty($a['is_trashed']);
  if ($alive && $ttl > 0) db()->prepare('REPLACE INTO lh_kv (k,v,exp) VALUES (?,?,?)')->execute([$k, '1', time() + $ttl]);
  return $alive;
}
function forget_folder_ids(array $ids): void {
  foreach (array_unique(array_filter($ids)) as $id) {
    db()->prepare('DELETE FROM lh_folders WHERE zoho_id=?')->execute([$id]);
    db()->prepare('DELETE FROM lh_kv WHERE k=?')->execute(['fv:' . substr(md5($id), 0, 30)]);
  }
}
function client_folder(string $key, string $name, bool $create = true): ?string {
  $st = db()->prepare('SELECT zoho_id FROM lh_folders WHERE client_key=?');
  $st->execute([$key]);
  if ($r = $st->fetch()) { if (folder_alive($r['zoho_id'])) return $r['zoho_id']; forget_folder_ids([$r['zoho_id']]); }   /* deleted by hand: forget it, then find or create a fresh one */
  $root = cfg()['zoho']['root_folder_id'];
  $fname = safe_name($name, $key);
  foreach (zoho_list($root) as $it) { if ($it['folder'] && strcasecmp($it['name'], $fname) === 0) { db()->prepare('REPLACE INTO lh_folders (client_key,zoho_id,name) VALUES (?,?,?)')->execute([$key, $it['id'], $fname]); return $it['id']; } }
  if (!$create) return null;
  $id = create_folder($root, $fname);
  db()->prepare('REPLACE INTO lh_folders (client_key,zoho_id,name) VALUES (?,?,?)')->execute([$key, $id, $fname]);
  return $id;
}
/* "Brand assets/Logos" -> the (nested) folder inside $parentId, created on the way when $create is true */
function ensure_path(string $parentId, string $path, bool $create = true): ?string {
  $segs = array_values(array_filter(array_map(fn($x) => safe_name($x, ''), explode('/', str_replace('\\', '/', $path))), fn($x) => $x !== ''));
  if (count($segs) > 4) out(400, ['error' => 'Folder path is too deep (4 levels at most).']);
  $cur = $parentId;
  foreach ($segs as $seg) {
    $key = 'p' . substr(md5($cur . '/' . strtolower($seg)), 0, 32);
    $st = db()->prepare('SELECT zoho_id FROM lh_folders WHERE client_key=?');
    $st->execute([$key]);
    if ($r = $st->fetch()) { if (folder_alive($r['zoho_id'])) { $cur = $r['zoho_id']; continue; } forget_folder_ids([$r['zoho_id']]); }
    $found = null;
    foreach (zoho_list($cur) as $it) { if ($it['folder'] && strcasecmp($it['name'], $seg) === 0) { $found = $it['id']; break; } }
    if (!$found) { if (!$create) return null; $found = create_folder($cur, $seg); }
    db()->prepare('REPLACE INTO lh_folders (client_key,zoho_id,name) VALUES (?,?,?)')->execute([$key, $found, $seg]);
    $cur = $found;
  }
  return $cur;
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
/* '64M' -> bytes */
function ini_bytes(string $v): int {
  $v = trim($v); if ($v === '') return 0;
  $n = (int)$v; $u = strtolower(substr($v, -1));
  return $u === 'g' ? $n * 1073741824 : ($u === 'm' ? $n * 1048576 : ($u === 'k' ? $n * 1024 : $n));
}
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

/* ---------- removing things: always to the Zoho trash (recoverable), never permanent ---------- */
/* Zoho "move to trash" = status 51 (restore = 1, permanent delete = 61) */
function zoho_trash(string $id): array {
  [$st, $j, $raw] = zoho_api('PATCH', '/files/' . rawurlencode($id), ['data' => ['attributes' => ['status' => '51'], 'type' => 'files']]);
  $already = strpos($raw, 'F221') !== false || $st === 404;   /* "Resource has been Trashed already", or it no longer exists (deleted by hand) */
  return [in_array($st, [200, 201, 204], true) || $already, $st, substr($raw, 0, 240)];
}
/* rename a file or folder in Zoho; returns [ok, http status, reply]. Zoho error R002 = a folder with that name already exists */
function zoho_rename(string $id, string $name): array {
  [$st, $j, $raw] = zoho_api('PATCH', '/files/' . rawurlencode($id), ['data' => ['attributes' => ['name' => $name], 'type' => 'files']]);
  return [in_array($st, [200, 201, 204], true), $st, substr($raw, 0, 240)];
}
/* Zoho file ids that a brand record links to */
function zoho_ids_in(string $json): array {
  preg_match_all('#api/download\.php\?id=([A-Za-z0-9]{10,80})#', $json, $m);
  return array_values(array_unique($m[1]));
}
function cache_forget(string $id): void {
  $cp = cfg_path();
  if ($cp && preg_match('/^[A-Za-z0-9]{10,80}$/', $id)) { $f = dirname($cp) . '/lh-cache/' . $id; if (is_file($f)) @unlink($f); }
}
function queue_trash(string $id, string $kind, string $why): void {
  db()->prepare('INSERT INTO lh_pending (zoho_id,kind,reason,tries,created_at) VALUES (?,?,?,0,?)')->execute([$id, $kind, substr($why, 0, 250), now()]);
}
/* trash files of one brand – only files LatchHub itself uploaded for that brand; returns the number trashed */
function trash_brand_files(array $ids, string $brandKey): int {
  $n = 0;
  foreach (array_slice($ids, 0, 300) as $id) {
    $st = db()->prepare('SELECT 1 FROM lh_files WHERE zoho_id=? AND client_key=?');
    $st->execute([$id, $brandKey]);
    if (!$st->fetch()) continue;                      /* not ours: never touched */
    [$ok, $code, $raw] = zoho_trash($id);
    if ($ok) { db()->prepare('DELETE FROM lh_files WHERE zoho_id=?')->execute([$id]); cache_forget($id); $n++; }
    else { queue_trash($id, 'file', 'HTTP ' . $code . ' ' . $raw); error_log('LatchHub trash failed ' . $id . ': ' . $code . ' ' . $raw); }
  }
  return $n;
}
/* retry what could not be trashed earlier (Zoho down, busy…) */
function process_pending(int $max = 5, bool $force = false): array {
  $done = 0; $failed = 0;
  try {
    foreach (db()->query('SELECT id,zoho_id,kind,tries FROM lh_pending ' . ($force ? '' : 'WHERE tries < 8 ') . 'ORDER BY id LIMIT ' . (int)$max)->fetchAll() as $r) {
      [$ok, $code, $raw] = zoho_trash($r['zoho_id']);
      if ($ok) { $done++; db()->prepare('DELETE FROM lh_pending WHERE id=?')->execute([$r['id']]); db()->prepare('DELETE FROM lh_files WHERE zoho_id=?')->execute([$r['zoho_id']]); cache_forget($r['zoho_id']); }
      else { $failed++; db()->prepare('UPDATE lh_pending SET tries=tries+1, reason=? WHERE id=?')->execute([substr('HTTP ' . $code . ' ' . $raw, 0, 250), $r['id']]); }
    }
  } catch (Throwable $e) { error_log('LatchHub pending: ' . $e->getMessage()); }
  return ['done' => $done, 'failed' => $failed];
}

/* ---------- big uploads arrive in small pieces and are put back together here ---------- */
function chunk_base(): string {
  $cp = cfg_path();
  $b = ($cp ? dirname($cp) . '/lh-cache' : sys_get_temp_dir() . '/lh-chunks') . '/tmp';
  if (!is_dir($b)) @mkdir($b, 0700, true);
  return $b;
}
function rrmdir(string $d): void {
  if (!is_dir($d)) return;
  foreach (scandir($d) ?: [] as $x) { if ($x === '.' || $x === '..') continue; $p = $d . '/' . $x; is_dir($p) ? rrmdir($p) : @unlink($p); }
  @rmdir($d);
}
function chunk_cleanup_old(string $base): void {   /* abandoned uploads older than a day */
  foreach (glob($base . '/*', GLOB_ONLYDIR) ?: [] as $d) { if (filemtime($d) < time() - 86400) rrmdir($d); }
}

/* ---------- activity log: who did what, to which client, when, from where (shown to the admin) ---------- */
function client_ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64); }
/* never lets a logging problem break the real request */
function log_activity(string $action, ?array $user = null, array $o = []): void {
  try {
    if ($user === null) $user = current_user();
    db()->prepare('INSERT INTO lh_activity (at,user_id,user_name,role,action,client_id,client_name,details,ip) VALUES (?,?,?,?,?,?,?,?,?)')->execute([
      gmdate('Y-m-d H:i:s'), (int)($user['id'] ?? 0), substr((string)($user['name'] ?? ($o['who'] ?? '')), 0, 120), substr((string)($user['role'] ?? ''), 0, 12), substr($action, 0, 40),
      substr((string)($o['client_id'] ?? ''), 0, 40), substr((string)($o['client_name'] ?? ''), 0, 190), substr((string)($o['details'] ?? ''), 0, 1500), client_ip()]);
    if (mt_rand(1, 300) === 1) db()->prepare('DELETE FROM lh_activity WHERE at < ?')->execute([gmdate('Y-m-d H:i:s', time() - 400 * 86400)]);   /* keep about 13 months */
  } catch (Throwable $e) { error_log('LatchHub activity: ' . $e->getMessage()); }
}
/* ---------- activity categories: every action belongs to one section of the admin dashboard ---------- */
const LH_CATS = ['add' => 'Added', 'edit' => 'Edited', 'delete' => 'Deleted', 'download' => 'Downloaded & copied', 'customise' => 'Customised', 'view' => 'Viewed', 'check' => 'Design checks', 'work' => 'Work on tasks', 'auth' => 'Sign-ins & account', 'admin' => 'Admin & team', 'error' => 'Problems'];
function act_cat(string $a): string {
  static $fixed = ['client_created' => 'add', 'file_uploaded' => 'add', 'smart_import' => 'add', 'client_updated' => 'edit', 'client_deleted' => 'delete', 'files_trashed' => 'delete',
    'svg_download' => 'customise', 'logo_variants' => 'customise', 'icon_created' => 'customise', 'value_copied' => 'download', 'lens_check' => 'check',
    'client_opened' => 'view', 'section_viewed' => 'view', 'link_opened' => 'view', 'client_error' => 'error', 'login_failed' => 'error', 'login_blocked' => 'error', 'password_change_failed' => 'error',
    'login' => 'auth', 'logout' => 'auth', 'password_changed' => 'auth', 'name_changed' => 'auth',
    'client_restored' => 'admin', 'cleanup_retry' => 'admin', 'selftest' => 'admin', 'password_reset' => 'admin', 'backup_restored' => 'admin', 'backup_download' => 'admin'];
  if (isset($fixed[$a])) return $fixed[$a];
  if (strpos($a, 'task_') === 0 || $a === 'desk_reset') return 'work';
  if (strpos($a, 'user_') === 0) return 'admin';
  if (preg_match('/_added$/', $a)) return 'add';
  if (preg_match('/_(removed|deleted)$/', $a)) return 'delete';
  if (preg_match('/_(renamed|edited|replaced|moved)$/', $a)) return 'edit';
  if (preg_match('/_(download|downloaded|copied)$/', $a)) return 'download';
  return 'edit';
}
/* every single change between two versions of a client record: a list of [action, details], one per item */
function brand_changes(array $o, array $n): array {
  $c = [];
  $label = function ($x) { return is_array($x) ? (string)($x['name'] ?? $x['title'] ?? $x['id'] ?? '?') : '?'; };
  $byId = function ($arr) { $m = []; foreach (is_array($arr) ? $arr : [] as $x) { if (is_array($x) && isset($x['id'])) $m[(string)$x['id']] = $x; } return $m; };
  if ((string)($o['name'] ?? '') !== (string)($n['name'] ?? '')) $c[] = ['client_renamed', '"' . ($o['name'] ?? '') . '" → "' . ($n['name'] ?? '') . '"'];
  $extra = [
    'logos' => fn($x) => trim(($x['group'] ?? '') . (!empty($x['formats']) ? ' · ' . implode('/', array_map(fn($f) => (string)($f['label'] ?? ''), array_slice((array)$x['formats'], 0, 6))) : '')),
    'elements' => fn($x) => (string)($x['type'] ?? ''),
    'fonts' => fn($x) => trim(($x['role'] ?? '') . (!empty($x['weights']) ? ' · ' . $x['weights'] : '')),
    'colors' => fn($x) => trim(($x['hex'] ?? '') . (!empty($x['role']) ? ' · ' . $x['role'] : '')),
    'links' => fn($x) => (string)($x['url'] ?? ''),
  ];
  foreach (['logos' => 'logo', 'elements' => 'element', 'fonts' => 'font', 'colors' => 'colour', 'links' => 'link'] as $k => $w) {
    $a = $byId($o[$k] ?? []); $b = $byId($n[$k] ?? []);
    foreach (['_added' => array_diff_key($b, $a), '_removed' => array_diff_key($a, $b)] as $suf => $set) {
      $i = 0;
      foreach ($set as $x) {
        if (++$i > 25) { $c[] = [$w . $suf, '… and ' . (count($set) - 25) . ' more']; break; }
        $e = $extra[$k]($x); $c[] = [$w . $suf, $label($x) . ($e !== '' ? ' (' . $e . ')' : '')];
      }
    }
    foreach (array_intersect_key($b, $a) as $id => $x) {
      $y = $a[$id];
      if ($label($x) !== $label($y)) $c[] = [$w . '_renamed', '"' . $label($y) . '" → "' . $label($x) . '"'];
      $d = [];
      if ($k === 'colors') { if (strtolower((string)($x['hex'] ?? '')) !== strtolower((string)($y['hex'] ?? ''))) $d[] = ($y['hex'] ?? '?') . ' → ' . ($x['hex'] ?? '?'); if ((string)($x['role'] ?? '') !== (string)($y['role'] ?? '')) $d[] = 'role ' . ($y['role'] ?? '') . ' → ' . ($x['role'] ?? ''); }
      if ($k === 'fonts') foreach (['role', 'weights', 'url'] as $f) { if ((string)($x[$f] ?? '') !== (string)($y[$f] ?? '')) $d[] = $f . ' changed'; }
      if ($k === 'fonts' && empty($y['file']) !== empty($x['file'])) $d[] = empty($x['file']) ? 'font file removed' : 'font file added';
      if ($k === 'links' && (string)($x['url'] ?? '') !== (string)($y['url'] ?? '')) $d[] = 'address changed';
      if (in_array($k, ['logos', 'elements'], true) && json_encode($x['formats'] ?? null) !== json_encode($y['formats'] ?? null)) $d[] = 'files updated';
      if ($k === 'logos' && (string)($x['group'] ?? '') !== (string)($y['group'] ?? '')) $d[] = 'moved to ' . ($x['group'] ?? '');
      if ($d) $c[] = [$w . '_edited', $label($x) . ': ' . implode(', ', $d)];
    }
  }
  $ob = $o['book']['url'] ?? (!empty($o['book']) ? 'x' : ''); $nb = $n['book']['url'] ?? (!empty($n['book']) ? 'x' : '');
  $bt = (string)($n['book']['title'] ?? ($o['book']['title'] ?? 'Brand book'));
  if (!$ob && $nb) $c[] = ['brand_book_added', $bt]; elseif ($ob && !$nb) $c[] = ['brand_book_removed', $bt]; elseif ($ob && $nb && $ob !== $nb) $c[] = ['brand_book_replaced', $bt];
  $or = is_array($o['rules'] ?? null) ? $o['rules'] : []; $nr = is_array($n['rules'] ?? null) ? $n['rules'] : [];
  $rk = array_values(array_filter(array_unique(array_merge(array_keys($or), array_keys($nr))), fn($k) => json_encode($or[$k] ?? null) !== json_encode($nr[$k] ?? null)));
  if ($rk) $c[] = ['rules_edited', 'Changed: ' . implode(', ', array_map(fn($k) => ['tol' => 'colour tolerance', 'minLogo' => 'minimum logo size', 'requireLogo' => 'logo required', 'neutrals' => 'neutrals allowed', 'forbidden' => 'forbidden colours', 'notes' => 'written rules'][$k] ?? (string)$k, $rk))];
  if ((string)($o['notes'] ?? '') !== (string)($n['notes'] ?? '')) $c[] = ['description_edited', (function_exists('mb_substr') ? mb_substr((string)($n['notes'] ?? ''), 0, 160) : substr((string)($n['notes'] ?? ''), 0, 160))];
  if ((string)($o['parent'] ?? '') !== (string)($n['parent'] ?? '')) $c[] = ['client_moved', !empty($n['parent']) ? 'made a sub-brand' : 'no longer a sub-brand'];
  if (json_encode($o['iconTheme'] ?? null) !== json_encode($n['iconTheme'] ?? null)) $c[] = ['icon_style_edited', 'Icon style changed'];
  return $c;
}
/* the same changes in one line (kept for anything that wants a short summary) */
function brand_diff(array $o, array $n): string { return implode('; ', array_map(fn($x) => str_replace('_', ' ', $x[0]) . ': ' . $x[1], brand_changes($o, $n))); }
/* a person's display name: trimmed, single spaces, no control characters, at most 60 characters ('' = not acceptable) */
function clean_person_name(string $n): string {
  $n = trim((string)preg_replace('/\s+/u', ' ', (string)preg_replace('/[\x00-\x1F\x7F<>]+/u', '', $n)));
  $len = function_exists('mb_strlen') ? mb_strlen($n) : strlen($n);
  return ($len < 1 || $len > 60) ? '' : $n;
}
