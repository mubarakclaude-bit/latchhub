<?php
declare(strict_types=1);
/*
 Shared client (brand) records – one row per brand, visible to every signed-in designer.
 GET                                   -> { brands: [ {id, version, brand} ] }
 POST {action:"save", brand, base_version}   create (base_version 0) or update; refuses (409) if someone saved a newer version first
 GET ?deleted=1                        admin: deleted clients that can still be restored
 POST {action:"delete", id}                  admin only; the client's Zoho folder moves to the WorkDrive trash (recoverable)
 POST {action:"restore", id}                 admin only; brings a deleted client and its Zoho folder back
 A save also moves to the trash any Zoho file that the record no longer links to (a removed logo, element, font or replaced brand book).
*/
require __DIR__ . '/_lib.php';
$method = $_SERVER['REQUEST_METHOD'] ?? '';
$x = db();
if ($method === 'GET' && !empty($_GET['pending'])) {
  require_admin();
  out(200, ['pending' => $x->query('SELECT id,zoho_id,kind,reason,tries,created_at FROM lh_pending ORDER BY id DESC LIMIT 100')->fetchAll()]);
}
if ($method === 'GET' && !empty($_GET['deleted'])) {
  require_admin();
  $rows = $x->query('SELECT d.id,d.name,d.deleted_at,u.name AS by_name FROM lh_deleted d LEFT JOIN lh_users u ON u.id=d.deleted_by ORDER BY d.deleted_at DESC')->fetchAll();
  out(200, ['deleted' => $rows]);
}
if ($method === 'GET') {
  require_login();
  $out = [];
  foreach ($x->query('SELECT id,json,version FROM lh_brands ORDER BY name')->fetchAll() as $r) $out[] = ['id' => $r['id'], 'version' => (int)$r['version'], 'brand' => json_decode($r['json'], true)];
  out(200, ['brands' => $out]);
}
require_method('POST');
$user = require_login(true);
$b = body_json();
$act = (string)($b['action'] ?? '');
if ($act === 'retry_pending') {
  require_admin(true);
  $rp = process_pending(25, true);
  log_activity('cleanup_retry', null, ['details' => $rp['done'] . ' moved to the Zoho trash, ' . $rp['failed'] . ' still refused']);
  out(200, ['ok' => true] + $rp);
}
if ($act === 'restore') {
  require_admin(true);
  $id = (string)($b['id'] ?? '');
  $r = $x->prepare('SELECT * FROM lh_deleted WHERE id=?');
  $r->execute([$id]);
  $d = $r->fetch();
  if (!$d) out(404, ['error' => 'Nothing to restore for that client.']);
  if ($d['folder_id'] !== '') {
    [$s, $j, $raw] = zoho_api('PATCH', '/files/' . rawurlencode($d['folder_id']), ['data' => ['attributes' => ['status' => '1'], 'type' => 'files']]);
    if (!in_array($s, [200, 201, 204], true)) out(502, ['error' => 'Zoho could not restore the folder (HTTP ' . $s . '). If it was already emptied from the WorkDrive trash, the files are gone; the client record can still be restored without them.', 'status' => $s, 'detail' => substr($raw, 0, 200)]);
    $x->prepare('REPLACE INTO lh_folders (client_key,zoho_id,name) VALUES (?,?,?)')->execute([$id, $d['folder_id'], safe_name($d['name'], $id)]);
  }
  foreach (json_decode($d['files'], true) ?: [] as $f) {
    $x->prepare('INSERT INTO lh_files (zoho_id,client_key,name,bytes,orig_bytes,method,user_id,created_at) VALUES (?,?,?,?,?,?,?,?)')->execute([$f['zoho_id'], $id, $f['name'], (int)$f['bytes'], (int)$f['orig_bytes'], (string)$f['method'], (int)$f['user_id'], $f['created_at']]);
  }
  try { $x->prepare('INSERT INTO lh_brands (id,name,json,version,updated_by,updated_at) VALUES (?,?,?,1,?,?)')->execute([$id, $d['name'], $d['json'], (int)$user['id'], now()]); }
  catch (PDOException $e) { out(409, ['error' => 'A client with that id already exists.']); }
  $x->prepare('DELETE FROM lh_deleted WHERE id=?')->execute([$id]);
  log_activity('client_restored', $user, ['client_id' => $id, 'client_name' => $d['name'], 'details' => 'Client and its Zoho folder restored']);
  out(200, ['ok' => true]);
}
if ($act === 'delete') {
  require_admin(true);
  $id = (string)($b['id'] ?? '');
  if (!valid_client_key($id)) out(400, ['error' => 'Invalid brand id.']);
  $old = $x->prepare('SELECT json FROM lh_brands WHERE id=?');
  $old->execute([$id]);
  $row = $old->fetch();
  $fo = $x->prepare('SELECT zoho_id FROM lh_folders WHERE client_key=?');
  $fo->execute([$id]);
  $f = $fo->fetch();
  $fl0 = $x->prepare('SELECT zoho_id,name,bytes,orig_bytes,method,user_id,created_at FROM lh_files WHERE client_key=?');
  $fl0->execute([$id]);
  if ($row) $x->prepare('REPLACE INTO lh_deleted (id,name,json,folder_id,files,deleted_by,deleted_at) VALUES (?,?,?,?,?,?,?)')->execute([$id, (string)(json_decode($row['json'], true)['name'] ?? $id), $row['json'], $f ? $f['zoho_id'] : '', json_encode($fl0->fetchAll()), (int)$user['id'], now()]);
  $x->prepare('DELETE FROM lh_brands WHERE id=?')->execute([$id]);
  $res = ['ok' => true, 'trashed_folder' => false];
  if ($f) {
    [$ok, $code, $raw] = zoho_trash($f['zoho_id']);
    if ($ok) {
      $res['trashed_folder'] = true;
      $x->prepare('DELETE FROM lh_folders WHERE client_key=?')->execute([$id]);
      $fl = $x->prepare('SELECT zoho_id FROM lh_files WHERE client_key=?');
      $fl->execute([$id]);
      foreach ($fl->fetchAll() as $r) cache_forget($r['zoho_id']);
      $x->prepare('DELETE FROM lh_files WHERE client_key=?')->execute([$id]);
    } else {
      queue_trash($f['zoho_id'], 'folder', 'HTTP ' . $code . ' ' . $raw);
      $res['warning'] = 'The client was removed, but Zoho did not move its folder to the trash (HTTP ' . $code . '). Zoho said: ' . substr(preg_replace('/\\s+/', ' ', $raw), 0, 160) . ' – see "Zoho clean-up queue" on the admin page, or delete the folder in WorkDrive by hand.';
    }
  }
  process_pending();
  log_activity('client_deleted', $user, ['client_id' => $id, 'client_name' => $row ? (string)(json_decode($row['json'], true)['name'] ?? $id) : $id, 'details' => !empty($res['trashed_folder']) ? 'Zoho folder moved to the WorkDrive trash' : ($f ? 'Zoho folder NOT trashed yet – ' . ($res['warning'] ?? '') : 'no Zoho folder existed')]);
  out(200, $res);
}
if ($act !== 'save') out(400, ['error' => 'Unknown action.']);
$brand = $b['brand'] ?? null;
if (!is_array($brand) || !valid_client_key((string)($brand['id'] ?? '')) || trim((string)($brand['name'] ?? '')) === '') out(400, ['error' => 'A brand needs a valid id and a name.']);
$json = json_encode($brand, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$tooBig = strlen($json) > 3000000;
if (!$tooBig && preg_match_all('/"data:[^"]*"/', $json, $dm)) { foreach ($dm[0] as $d) { if (strlen($d) > 200000) { $tooBig = true; break; } } }
if ($tooBig) out(413, ['error' => 'This brand still contains large inline files. Files must be uploaded to Zoho first.']);
$id = (string)$brand['id'];
$base = (int)($b['base_version'] ?? 0);
$name = substr(trim((string)$brand['name']), 0, 190);
if ($base === 0) {
  try { $x->prepare('INSERT INTO lh_brands (id,name,json,version,updated_by,updated_at) VALUES (?,?,?,1,?,?)')->execute([$id, $name, $json, (int)$user['id'], now()]); log_activity('client_created', $user, ['client_id' => $id, 'client_name' => $name, 'details' => count($brand['logos'] ?? []) . ' logos, ' . count($brand['colors'] ?? []) . ' colours, ' . count($brand['fonts'] ?? []) . ' fonts' . (!empty($brand['book']) ? ', brand book' : '')]); out(200, ['ok' => true, 'version' => 1]); }
  catch (PDOException $e) { /* already exists: someone created it first */ }
} else {
  $o = $x->prepare('SELECT json FROM lh_brands WHERE id=? AND version=?');
  $o->execute([$id, $base]);
  $before = $o->fetch();
  $st = $x->prepare('UPDATE lh_brands SET name=?, json=?, version=version+1, updated_by=?, updated_at=? WHERE id=? AND version=?');
  $st->execute([$name, $json, (int)$user['id'], now(), $id, $base]);
  if ($st->rowCount() === 1) {
    $trashed = $before ? trash_brand_files(array_diff(zoho_ids_in($before['json']), zoho_ids_in($json)), $id) : 0;
    /* a renamed client gets its Zoho folder renamed too (the folder is tracked by id, so uploads keep going to the same place even if this fails) */
    $res = ['ok' => true, 'version' => $base + 1, 'trashed' => $trashed];
    $oldName = $before ? (string)(json_decode($before['json'], true)['name'] ?? '') : '';
    if ($before && safe_name($oldName, $id) !== safe_name($name, $id)) {
      $fo = $x->prepare('SELECT zoho_id FROM lh_folders WHERE client_key=?');
      $fo->execute([$id]);
      if ($f = $fo->fetch()) {
        $newFolder = safe_name($name, $id);
        [$ok, $code, $raw] = zoho_rename($f['zoho_id'], $newFolder);
        if ($ok) { $x->prepare('UPDATE lh_folders SET name=? WHERE client_key=?')->execute([$newFolder, $id]); $res['renamed'] = true; }
        else {
          error_log('LatchHub rename ' . $id . ': ' . $code . ' ' . $raw);
          $res['warning'] = strpos($raw, 'R002') !== false
            ? 'The client was renamed, but Zoho already has a folder called "' . $newFolder . '" in LatchHub, so this client\'s folder keeps its old name. Rename one of them in WorkDrive.'
            : 'The client was renamed, but Zoho did not rename its folder (HTTP ' . $code . '). Files still go to the same folder; you can rename it in WorkDrive.';
        }
      }
    }
    process_pending();
    /* one activity row per change, so the admin sees each logo, colour, font… that was added, edited or removed */
    $changes = $before ? brand_changes(json_decode($before['json'], true) ?: [], $brand) : [['client_updated', 'saved']];
    foreach (array_slice($changes, 0, 120) as [$act, $det]) {
      if ($act === 'client_renamed') $det .= (!empty($res['renamed']) ? ' · Zoho folder renamed' : '') . (!empty($res['warning']) ? ' · WARNING: ' . $res['warning'] : '');
      log_activity($act, $user, ['client_id' => $id, 'client_name' => $name, 'details' => $det]);
    }
    if ($trashed) log_activity('files_trashed', $user, ['client_id' => $id, 'client_name' => $name, 'details' => $trashed . ' file' . ($trashed > 1 ? 's' : '') . ' moved to the Zoho trash']);
    if (!$changes && !$trashed && !empty($res['warning'])) log_activity('client_updated', $user, ['client_id' => $id, 'client_name' => $name, 'details' => 'WARNING: ' . $res['warning']]);
    out(200, $res);
  }
}
$cur = $x->prepare('SELECT json,version FROM lh_brands WHERE id=?');
$cur->execute([$id]);
$r = $cur->fetch();
out(409, ['error' => 'Someone else changed this brand first.', 'current' => $r ? ['version' => (int)$r['version'], 'brand' => json_decode($r['json'], true)] : null]);
