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
  $kids = array_keys(array_filter($st['files'], fn($f) => $f['parent'] === $mm[1] && empty($f['trashed'])));
  $off = (int)($_GET['page']['offset'] ?? 0); $lim = (int)($_GET['page']['limit'] ?? 50);
  $j(['data' => array_map($item, array_slice($kids, $off, $lim))]);
}
if (preg_match('#^/workdrive/api/v1/files/([A-Za-z0-9]+)$#', $path, $mm) && $m === 'GET') { (isset($st['files'][$mm[1]]) && empty($st['files'][$mm[1]]['trashed'])) ? $j(['data' => $item($mm[1])]) : $j(['errors' => []], 404); }
if (preg_match('#^/workdrive/api/v1/files/([A-Za-z0-9]+)$#', $path, $mm) && $m === 'PATCH') {
  $id = $mm[1]; $attr = json_decode(file_get_contents('php://input'), true)['data']['attributes'] ?? []; $s = (string)($attr['status'] ?? '');
  if (!isset($st['files'][$id])) $j(['errors' => []], 404);
  if (isset($attr['name'])) {
    foreach ($st['files'] as $k => $f) { if ($k !== $id && $f['parent'] === $st['files'][$id]['parent'] && empty($f['trashed']) && strcasecmp($f['name'], $attr['name']) === 0) $j(['errors' => [['id' => 'R002', 'title' => 'Folder with same name exists in the workspace. Please use a different name']]], 400); }
    $st['files'][$id]['name'] = $attr['name']; $save(); $j(['data' => $item($id)]);
  }
  if ($s === '51') {
    if (stripos($st['files'][$id]['name'], 'failtrash') !== false) $j(['errors' => [['id' => 'F415', 'title' => 'Trash operation not allowed.']]], 400);
    if (!empty($st['files'][$id]['trashed'])) $j(['errors' => [['id' => 'F221', 'title' => 'Resource has been Trashed already']]], 400);
    $trash = function ($k) use (&$trash, &$st) { $st['files'][$k]['trashed'] = true; foreach ($st['files'] as $c => $f) if ($f['parent'] === $k) $trash($c); };
    $trash($id); $save(); $j(['data' => $item($id)]);
  }
  if ($s === '1') { $un = function ($k) use (&$un, &$st) { unset($st['files'][$k]['trashed']); foreach ($st['files'] as $c => $f) if ($f['parent'] === $k) $un($c); }; $un($id); $save(); $j(['data' => $item($id)]); }
  $j(['errors' => ['unsupported status']], 400);
}
if ($path === '/workdrive/api/v1/files' && $m === 'POST') {
  $b = json_decode(file_get_contents('php://input'), true)['data']['attributes'] ?? []; $id = 'NEWFOLDER' . (++$st['n']) . '000';
  $st['files'][$id] = ['name' => $b['name'], 'parent' => $b['parent_id'], 'folder' => true]; $save(); $j(['data' => $item($id)], 201);
}
$uniq = function ($parent, $name) use (&$st) { foreach ($st['files'] as $f) { if ($f['parent'] === $parent && empty($f['trashed']) && $f['name'] === $name) { $i = pathinfo($name); return $i['filename'] . '_' . date('YmdHis') . (isset($i['extension']) ? '.' . $i['extension'] : ''); } } return $name; };
if ($path === '/workdrive/api/v1/upload' && $m === 'POST') {
  $f = $_FILES['content'] ?? null; if (!$f || !isset($st['files'][$_POST['parent_id'] ?? '']) || !empty($st['files'][$_POST['parent_id']]['trashed'])) $j(['errors' => [['id' => 'F6014', 'title' => 'Parent folder not found']]], 400);
  $id = 'NEWFILE' . (++$st['n']) . '0000'; $nm0 = urldecode($_POST['filename'] ?? $f['name']); if (($_POST['override-name-exist'] ?? 'false') === 'false') $nm0 = $uniq($_POST['parent_id'], $nm0);   /* like Zoho: a name already there gets a timestamp */
  $st['files'][$id] = ['name' => $nm0, 'parent' => $_POST['parent_id'], 'folder' => false, 'data' => base64_encode(file_get_contents($f['tmp_name']))];
  $save(); $j(['data' => [['attributes' => ['resource_id' => $id, 'FileName' => $st['files'][$id]['name']]]]], 200);
}
/* ---- large files: "Upload Large File" stream upload and chunk sessions (create → parts in order → commit) ---- */
$CHUNK = (int)(getenv('MOCK_CHUNK') ?: 1048576); $CHUNK_MIN = (int)(getenv('MOCK_CHUNK_MIN') ?: 2097152);
$sess = function ($id) use (&$st) { $s = $st['sessions'][$id]; $got = strlen(base64_decode($s['data'])); $tot = (int)ceil($s['size'] / $s['chunk']);
  return ['received_bytes' => $got, 'chunk_size' => $s['chunk'], 'upload_id' => $id, 'remaining_chunks' => $tot - intdiv($got + $s['chunk'] - 1, $s['chunk']), 'total_chunks' => $tot, 'file_size' => $s['size'],
    'next_chunk' => $got . '-' . min($s['size'] - 1, $got + $s['chunk'] - 1), 'remaining_bytes' => $s['size'] - $got, 'uploaded_chunks' => intdiv($got + $s['chunk'] - 1, $s['chunk']), 'status' => 'D9231']; };
$failFlag = $stateFile . '.fail';   /* tests write "reject" (Zoho refuses the next part) or "lose" (Zoho keeps it but the reply is lost) */
if ($path === '/workdrive/api/v1/uploadsession/create' && $m === 'POST') {
  $size = (int)($_GET['size'] ?? 0); $par = (string)($_GET['parent_id'] ?? '');
  if ($size <= $CHUNK_MIN) $j(['errors' => [['id' => 'D9214', 'title' => 'Chunk Upload is not allowed for this file size']]], 401);
  if (!isset($st['files'][$par]) || !empty($st['files'][$par]['trashed']) || empty($st['files'][$par]['folder'])) $j(['errors' => [['id' => 'D9214', 'title' => 'Bad input - missing folder/resource ID']]], 401);
  $id = 'CFU_' . (++$st['n']) . 'x'; $st['sessions'][$id] = ['size' => $size, 'name' => (string)($_GET['file_name'] ?? 'file'), 'parent' => $par, 'chunk' => $CHUNK, 'data' => '', 'done' => false];
  $save(); $j($sess($id));
}
if ($path === '/workdrive/api/v1/uploadsession' && $m === 'GET') { $id = (string)($_GET['upload_id'] ?? ''); isset($st['sessions'][$id]) ? $j($sess($id)) : $j(['errors' => [['id' => 'D9232', 'title' => 'Invalid upload ID']]], 404); }
if ($path === '/workdrive/api/v1/uploadsession/commit' && $m === 'POST') {
  $id = (string)($_GET['upload_id'] ?? ''); if (!isset($st['sessions'][$id])) $j(['errors' => [['id' => 'D9232', 'title' => 'Invalid upload ID']]], 404);
  $s = &$st['sessions'][$id];
  if ($s['done'] || strlen(base64_decode($s['data'])) !== $s['size']) $j(['errors' => [['id' => 'D9231', 'title' => 'Upload session has already been completed or chunks are yet to be uploaded']]], 412);
  $fid = 'BIGFILE' . (++$st['n']) . '0000'; $nm = $uniq($s['parent'], (string)($_GET['file_name'] ?? $s['name']));
  $st['files'][$fid] = ['name' => $nm, 'parent' => $s['parent'], 'folder' => false, 'data' => $s['data']]; $s['done'] = true; $s['data'] = ''; unset($s); $save();
  $j(['data' => [['attributes' => ['parent_id' => $st['files'][$fid]['parent'], 'FileName' => $nm, 'resource_id' => $fid], 'type' => 'files']]]);
}
if ($path === '/workdrive-api/v1/stream/upload' && $m === 'POST') {
  $body = file_get_contents('php://input'); $uid = (string)($_SERVER['HTTP_UPLOAD_ID'] ?? '');
  if ($uid === '' || ($_SERVER['HTTP_X_STREAMMODE'] ?? '') !== '1') $j(['errors' => [['id' => 'D9214', 'title' => 'Bad input']]], 400);
  if (!empty($_SERVER['HTTP_CONTENT_RANGE'])) {   /* one part of a chunk session */
    if (!isset($st['sessions'][$uid])) $j(['errors' => [['id' => 'D9232', 'title' => 'Invalid upload ID']]], 400);
    $s = &$st['sessions'][$uid]; $got = strlen(base64_decode($s['data']));
    if (!preg_match('#^bytes (\d+)-(\d+)/(\d+)$#', $_SERVER['HTTP_CONTENT_RANGE'], $r)) $j(['errors' => [['id' => 'D9233', 'title' => 'Invalid byte range']]], 400);
    $a = (int)$r[1]; $b = (int)$r[2];
    if ($a < $got && $b < $got) $j(['errors' => [['id' => 'D9238', 'title' => 'Same chunk uploaded more than once']]], 400);
    if ($a !== $got || (int)$r[3] !== $s['size'] || $b - $a + 1 !== strlen($body) || (strlen($body) !== $s['chunk'] && $b !== $s['size'] - 1)) $j(['errors' => [['id' => 'D9233', 'title' => 'Chunk uploaded out of sequence']]], 400);
    $fail = is_file($failFlag) ? trim((string)file_get_contents($failFlag)) : ''; if ($fail) @unlink($failFlag);
    if ($fail === 'reject') $j(['errors' => [['id' => 'D9200', 'title' => 'Temporary failure']]], 500);
    $s['data'] = base64_encode(base64_decode($s['data']) . $body); $save();
    if ($fail === 'lose') $j(['errors' => [['id' => 'X', 'title' => 'gateway timeout']]], 504);
    $j($sess($uid));
  }
  $par = (string)($_SERVER['HTTP_X_PARENT_ID'] ?? '');   /* whole-file stream upload */
  if (!isset($st['files'][$par]) || !empty($st['files'][$par]['trashed'])) $j(['errors' => [['id' => 'D9214', 'title' => 'Bad input - missing folder/resource ID']]], 400);
  $nm = $uniq($par, rawurldecode((string)($_SERVER['HTTP_X_FILENAME'] ?? 'file')));
  $id = 'STRMFILE' . (++$st['n']) . '000'; $st['files'][$id] = ['name' => $nm, 'parent' => $par, 'folder' => false, 'data' => base64_encode($body)]; $save();
  $j(['data' => [['attributes' => ['FileName' => $nm, 'parent_id' => $par], 'type' => 'files']]]);   /* no id in the reply: LatchHub must find it by name */
}
if (is_file($stateFile . '.noscope') && (strpos($path, '/v1/workdrive/download/') === 0 || $path === '/workdrive-api/v1/stream/upload')) $j(['ERROR_MESSAGE' => 'INVALID_OAUTHSCOPE', 'ERROR_CODE' => 'F7004'], 401);   /* a key made without ZohoFiles.files.* */
if (preg_match('#^/v1/workdrive/download/([A-Za-z0-9]+)$#', $path, $mm) && $m === 'GET') { if (!isset($st['files'][$mm[1]])) $j([], 404); header('Location: http://localhost:' . $_SERVER['SERVER_PORT'] . '/storage/' . $mm[1], true, 302); exit; }
if (preg_match('#^/storage/([A-Za-z0-9]+)$#', $path, $mm) && $m === 'GET') { if (!isset($st['files'][$mm[1]]) || !empty($st['files'][$mm[1]]['trashed'])) $j([], 404); header('Content-Type: application/octet-stream'); echo base64_decode($st['files'][$mm[1]]['data'] ?? ''); exit; }
$j(['errors' => ['no such mock route', $path]], 404);
