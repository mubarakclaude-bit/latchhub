<?php
declare(strict_types=1);
/*
 Shared client (brand) records – one row per brand, visible to every signed-in designer.
 GET                                   -> { brands: [ {id, version, brand} ] }
 POST {action:"save", brand, base_version}   create (base_version 0) or update; refuses (409) if someone saved a newer version first
 POST {action:"delete", id}                  admin only
*/
require __DIR__ . '/_lib.php';
$method = $_SERVER['REQUEST_METHOD'] ?? '';
$x = db();
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
if ($act === 'delete') {
  require_admin(true);
  $id = (string)($b['id'] ?? '');
  if (!valid_client_key($id)) out(400, ['error' => 'Invalid brand id.']);
  $x->prepare('DELETE FROM lh_brands WHERE id=?')->execute([$id]);
  out(200, ['ok' => true]);
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
  try { $x->prepare('INSERT INTO lh_brands (id,name,json,version,updated_by,updated_at) VALUES (?,?,?,1,?,?)')->execute([$id, $name, $json, (int)$user['id'], now()]); out(200, ['ok' => true, 'version' => 1]); }
  catch (PDOException $e) { /* already exists: someone created it first */ }
} else {
  $st = $x->prepare('UPDATE lh_brands SET name=?, json=?, version=version+1, updated_by=?, updated_at=? WHERE id=? AND version=?');
  $st->execute([$name, $json, (int)$user['id'], now(), $id, $base]);
  if ($st->rowCount() === 1) out(200, ['ok' => true, 'version' => $base + 1]);
}
$cur = $x->prepare('SELECT json,version FROM lh_brands WHERE id=?');
$cur->execute([$id]);
$r = $cur->fetch();
out(409, ['error' => 'Someone else changed this brand first.', 'current' => $r ? ['version' => (int)$r['version'], 'brand' => json_decode($r['json'], true)] : null]);
