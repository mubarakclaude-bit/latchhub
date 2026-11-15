<?php
declare(strict_types=1);
/*
 File manager: browse a client's Zoho folder as it really is (including files added by hand in WorkDrive).
   GET  ?client=…&name=…[&folder=<id>]     → {root, folder, trail:[{id,name}], items:[…], linked:[ids used on the brand page]}
   POST JSON {action:'mkdir',  client, name, folder?, folder_name}
   POST JSON {action:'rename', client, name, folder?, id, new_name}
   POST JSON {action:'trash',  client, name, folder?, ids:[…]}   → to the WorkDrive trash (restorable there)
 Only folders inside the client's own folder can be reached; anything else is refused.
*/
require __DIR__ . '/_lib.php';
require __DIR__ . '/_fm.php';
$isPost = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
if (!$isPost) require_method('GET');
$user = require_login($isPost);
session_write_close();
$in = $isPost ? body_json() : $_GET;
$key = (string)($in['client'] ?? '');
if (!valid_client_key($key)) out(400, ['error' => 'Missing or invalid client.']);
$clientName = substr(trim((string)($in['name'] ?? $key)), 0, 190);
$cf = client_folder($key, $clientName, $isPost);   /* browsing never creates folders in Zoho; changing something does */
$folder = (string)($in['folder'] ?? '');
if (!$cf) out(200, ['root' => null, 'folder' => null, 'trail' => [], 'items' => [], 'linked' => []]);
if ($folder === '') $folder = $cf;
$trail = fm_trail($cf, $folder);
if ($trail !== null && $folder !== $cf && !folder_alive($folder)) { db()->exec("DELETE FROM lh_kv WHERE k LIKE 'ft:%'"); $trail = null; }   /* deleted in WorkDrive since it was last checked */
if ($trail === null) out(404, ['error' => 'This folder is no longer there (deleted or moved in WorkDrive).', 'gone' => true]);

if (!$isPost) {
  $items = zoho_list($folder, 1000);
  usort($items, fn($a, $b) => [$b['folder'], strtolower($a['name'])] <=> [$a['folder'], strtolower($b['name'])]);
  out(200, ['root' => $cf, 'folder' => $folder, 'trail' => $trail, 'items' => $items, 'more' => count($items) >= 1000, 'linked' => fm_brand_ids($key)]);
}

$act = (string)($in['action'] ?? '');
$where = $trail ? implode(' › ', array_column($trail, 'name')) : 'client folder';
$log = function (string $action, string $details) use ($user, $key, $clientName) { log_activity($action, $user, ['client_id' => $key, 'client_name' => $clientName, 'details' => $details]); };

if ($act === 'mkdir') {
  $n = safe_name((string)($in['folder_name'] ?? ''), '');
  if ($n === '') out(400, ['error' => 'Give the folder a name.']);
  if (count($trail) >= 8) out(400, ['error' => 'Folders can be nested 8 levels deep at most.']);
  foreach (zoho_list($folder, 1000) as $it) { if (strcasecmp($it['name'], $n) === 0) out(409, ['error' => 'There is already something called "' . $n . '" here.']); }
  $id = create_folder($folder, $n);
  $log('folder_added', $n . ' · in ' . $where);
  out(200, ['ok' => true, 'id' => $id, 'name' => $n]);
}

if ($act === 'rename') {
  $it = fm_item_in($folder, (string)($in['id'] ?? ''));
  if (!$it) out(404, ['error' => 'That item is no longer in this folder. Refresh the list.']);
  $n = safe_name((string)($in['new_name'] ?? ''), '');
  if ($n === '') out(400, ['error' => 'The new name is empty.']);
  if (!$it['folder']) {
    $oe = strtolower(pathinfo($it['name'], PATHINFO_EXTENSION)); $ne = strtolower(pathinfo($n, PATHINFO_EXTENSION));
    if ($oe !== '' && $ne !== $oe) $n .= '.' . $oe;   /* keep the file type: "poster" → "poster.psd" */
  }
  if ($n === $it['name']) out(200, ['ok' => true, 'name' => $n]);
  [$ok, $code, $raw] = zoho_rename($it['id'], $n);
  if (!$ok) out($code === 400 ? 409 : 502, ['error' => strpos($raw, 'R002') !== false ? 'There is already something called "' . $n . '" here.' : 'Zoho did not rename it (HTTP ' . $code . ').']);
  if ($it['folder']) forget_folder_ids([$it['id']]);
  else db()->prepare('UPDATE lh_files SET name=? WHERE zoho_id=?')->execute([$n, $it['id']]);
  $log(($it['folder'] ? 'folder' : 'file') . '_renamed', '"' . $it['name'] . '" → "' . $n . '" · in ' . $where);
  out(200, ['ok' => true, 'name' => $n]);
}

if ($act === 'trash') {
  $ids = array_values(array_unique(array_filter(array_map('strval', (array)($in['ids'] ?? [])))));
  if (!$ids || count($ids) > 100) out(400, ['error' => 'Choose between 1 and 100 items.']);
  $linked = array_flip(fm_brand_ids($key)); $done = []; $refused = [];
  foreach ($ids as $id) {
    $it = fm_item_in($folder, $id);
    if (!$it) { $refused[] = ['id' => $id, 'why' => 'no longer in this folder']; continue; }
    if (isset($linked[$id])) { $refused[] = ['id' => $id, 'name' => $it['name'], 'why' => 'used on the brand page – remove it there']; continue; }
    if ($it['folder'] && $user['role'] !== 'admin') { $refused[] = ['id' => $id, 'name' => $it['name'], 'why' => 'only the admin can delete folders']; continue; }
    if ($it['folder'] && !$trail && in_array(strtolower($it['name']), ['brand assets', 'brand book'], true)) { $refused[] = ['id' => $id, 'name' => $it['name'], 'why' => 'the brand page keeps its files here']; continue; }
    [$ok, $code, $raw] = zoho_trash($id);
    if (!$ok) { $refused[] = ['id' => $id, 'name' => $it['name'], 'why' => 'Zoho refused (HTTP ' . $code . ')']; continue; }
    if ($it['folder']) { forget_folder_ids([$id]); db()->exec("DELETE FROM lh_kv WHERE k LIKE 'ft:%'"); } else { db()->prepare('DELETE FROM lh_files WHERE zoho_id=?')->execute([$id]); cache_forget($id); }
    $done[] = $it['name'];
  }
  if ($done) $log('files_trashed', implode(', ', array_slice($done, 0, 20)) . (count($done) > 20 ? ' and ' . (count($done) - 20) . ' more' : '') . ' · from ' . $where . ' (WorkDrive trash)');
  out(200, ['ok' => true, 'trashed' => count($done), 'refused' => $refused]);
}

out(400, ['error' => 'Unknown action.']);
