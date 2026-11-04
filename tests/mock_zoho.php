<?php
/* Router script for `php -S`: a tiny fake of the Zoho endpoints LatchHub uses, so the connector can be tested without real credentials. */
$stateFile = getenv('MOCK_STATE') ?: sys_get_temp_dir() . '/mockzoho.json';
$st = is_file($stateFile) ? json_decode(file_get_contents($stateFile), true) : ['n' => 0, 'files' => [
  'ROOT000000001' => ['name' => 'LatchHub', 'parent' => 'TEAM000000001', 'folder' => true],
  'OTHERFOLDER01' => ['name' => 'Private HR', 'parent' => 'TEAM000000001', 'folder' => true],
  'SECRETFILE001' => ['name' => 'salaries.pdf', 'parent' => 'OTHERFOLDER01', 'folder' => false, 'data' => base64_encode('top secret')]]];
$save = function () use (&$st, $stateFile) { file_put_contents($stateFile, json_encode($st)); };
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH); $m = $_SERVER['REQUEST_METHOD'];
$j = function ($d, $c = 200) { http_response_code($c); header('Content-Type: application/json'); echo json_encode($d); exit; };
if ($path === '/oauth/v2/token') { $ok = ($_POST['refresh_token'] ?? '') === 'RT' && ($_POST['grant_type'] ?? '') === 'refresh_token'; $j($ok ? ['access_token' => 'TESTTOKEN', 'expires_in' => 3600] : ['error' => 'invalid_code']); }
if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Zoho-oauthtoken TESTTOKEN') $j(['errors' => [['id' => 'INVALID_OAUTHTOKEN']]], 401);
$item = function ($id) use (&$st) { return ['id' => $id, 'attributes' => ['name' => $st['files'][$id]['name'], 'parent_id' => $st['files'][$id]['parent'], 'type' => $st['files'][$id]['folder'] ? 'folder' : 'file', 'extn' => pathinfo($st['files'][$id]['name'], PATHINFO_EXTENSION), 'storage_info' => ['size_in_bytes' => strlen(base64_decode($st['files'][$id]['data'] ?? ''))], 'modified_time' => '2026-11-04']]; };
if (preg_match('#^/workdrive/api/v1/files/([A-Za-z0-9]+)/files$#', $path, $mm) && $m === 'GET') {
  $kids = array_keys(array_filter($st['files'], fn($f) => $f['parent'] === $mm[1]));
  $off = (int)($_GET['page']['offset'] ?? 0); $lim = (int)($_GET['page']['limit'] ?? 50);
  $j(['data' => array_map($item, array_slice($kids, $off, $lim))]);
}
if (preg_match('#^/workdrive/api/v1/files/([A-Za-z0-9]+)$#', $path, $mm) && $m === 'GET') { isset($st['files'][$mm[1]]) ? $j(['data' => $item($mm[1])]) : $j(['errors' => []], 404); }
if ($path === '/workdrive/api/v1/files' && $m === 'POST') {
  $b = json_decode(file_get_contents('php://input'), true)['data']['attributes'] ?? []; $id = 'NEWFOLDER' . (++$st['n']) . '000';
  $st['files'][$id] = ['name' => $b['name'], 'parent' => $b['parent_id'], 'folder' => true]; $save(); $j(['data' => $item($id)], 201);
}
if ($path === '/workdrive/api/v1/upload' && $m === 'POST') {
  $f = $_FILES['content'] ?? null; if (!$f || !isset($st['files'][$_POST['parent_id'] ?? ''])) $j(['errors' => []], 400);
  $id = 'NEWFILE' . (++$st['n']) . '0000'; $st['files'][$id] = ['name' => urldecode($_POST['filename'] ?? $f['name']), 'parent' => $_POST['parent_id'], 'folder' => false, 'data' => base64_encode(file_get_contents($f['tmp_name']))];
  $save(); $j(['data' => [['attributes' => ['resource_id' => $id, 'FileName' => $st['files'][$id]['name']]]]], 200);
}
if (preg_match('#^/v1/workdrive/download/([A-Za-z0-9]+)$#', $path, $mm) && $m === 'GET') { if (!isset($st['files'][$mm[1]])) $j([], 404); header('Location: http://localhost:' . $_SERVER['SERVER_PORT'] . '/storage/' . $mm[1], true, 302); exit; }
if (preg_match('#^/storage/([A-Za-z0-9]+)$#', $path, $mm) && $m === 'GET') { if (!isset($st['files'][$mm[1]])) $j([], 404); header('Content-Type: application/octet-stream'); echo base64_decode($st['files'][$mm[1]]['data'] ?? ''); exit; }
$j(['errors' => ['no such mock route', $path]], 404);
