<?php
declare(strict_types=1);
/*
 Admin only: everything the dashboard draws, in one call.
 GET ?days=<1..400 (default 30)> &tz=<minutes east of UTC, e.g. 330 for India>
   platform  – clients, sub-brands, logos, colours, fonts, elements, brand books, links, people
   storage   – files LatchHub put in Zoho, stored size, size before compression
   totals / prev        – events per dashboard section, this period and the period before
   daily                – events per day and section (in the admin's own time zone)
   heat                 – 7 × 24 grid: weekday (Mon = 0) × hour, all events by people
   people / clients     – per-person and per-client breakdowns
   top_assets / top_actions / recent
*/
require __DIR__ . '/_lib.php';
require_method('GET');
require_admin();
session_write_close();
$x = db();
$days = max(1, min(400, (int)($_GET['days'] ?? 30)));
$tz = max(-840, min(840, (int)($_GET['tz'] ?? 0))) * 60;
$now = time();
$from = $now - $days * 86400;
$localDay = fn(int $ts) => gmdate('Y-m-d', $ts + $tz);

/* ---- the clients themselves ---- */
$users = [];
foreach ($x->query('SELECT id,email,name,role,active,created_at FROM lh_users ORDER BY role, name')->fetchAll() as $u) $users[(int)$u['id']] = $u;
$plat = ['clients' => 0, 'subbrands' => 0, 'logos' => 0, 'colors' => 0, 'fonts' => 0, 'elements' => 0, 'books' => 0, 'links' => 0];
$clients = [];
foreach ($x->query('SELECT id,json,version,updated_by,updated_at FROM lh_brands ORDER BY name')->fetchAll() as $r) {
  $b = json_decode($r['json'], true) ?: [];
  $n = fn($k) => is_array($b[$k] ?? null) ? count($b[$k]) : 0;
  $sub = !empty($b['parent']);
  $plat[$sub ? 'subbrands' : 'clients']++;
  foreach (['logos', 'colors', 'fonts', 'elements', 'links'] as $k) $plat[$k] += $n($k);
  if (!empty($b['book'])) $plat['books']++;
  $clients[$r['id']] = ['id' => $r['id'], 'name' => (string)($b['name'] ?? $r['id']), 'parent' => (string)($b['parent'] ?? ''),
    'logos' => $n('logos'), 'colors' => $n('colors'), 'fonts' => $n('fonts'), 'elements' => $n('elements'), 'links' => $n('links'), 'book' => !empty($b['book']),
    'swatch' => array_slice(array_values(array_filter(array_map(fn($c) => is_array($c) ? (string)($c['hex'] ?? '') : '', is_array($b['colors'] ?? null) ? $b['colors'] : []))), 0, 8),
    'version' => (int)$r['version'], 'updated_at' => $r['updated_at'], 'updated_by' => $users[(int)$r['updated_by']]['name'] ?? '',
    'events' => 0, 'downloads' => 0, 'views' => 0, 'changes' => 0, 'files' => 0, 'bytes' => 0];
}
$plat['people_active'] = count(array_filter($users, fn($u) => (int)$u['active'] === 1));
$plat['people'] = count($users);
$plat['deleted_clients'] = (int)$x->query('SELECT COUNT(*) c FROM lh_deleted')->fetch()['c'];
$plat['cleanup_waiting'] = (int)$x->query('SELECT COUNT(*) c FROM lh_pending')->fetch()['c'];

/* ---- what LatchHub stored in Zoho ---- */
$sto = $x->query("SELECT COUNT(*) n, COALESCE(SUM(bytes),0) b, COALESCE(SUM(orig_bytes),0) o FROM lh_files WHERE client_key <> '-'")->fetch();
$storage = ['files' => (int)$sto['n'], 'bytes' => (int)$sto['b'], 'orig_bytes' => (int)$sto['o'], 'by_method' => []];
foreach ($x->query("SELECT method, COUNT(*) n, COALESCE(SUM(bytes),0) b, COALESCE(SUM(orig_bytes),0) o FROM lh_files WHERE client_key <> '-' GROUP BY method")->fetchAll() as $m) $storage['by_method'][] = ['method' => $m['method'], 'files' => (int)$m['n'], 'bytes' => (int)$m['b'], 'orig_bytes' => (int)$m['o']];
foreach ($x->query("SELECT client_key, COUNT(*) n, COALESCE(SUM(bytes),0) b FROM lh_files GROUP BY client_key")->fetchAll() as $f) { if (isset($clients[$f['client_key']])) { $clients[$f['client_key']]['files'] = (int)$f['n']; $clients[$f['client_key']]['bytes'] = (int)$f['b']; } }

/* ---- activity, this period and the one before ---- */
$cats = array_keys(LH_CATS);
$zero = array_fill_keys($cats, 0);
$totals = $zero; $prev = $zero;
$pv = $x->prepare('SELECT action, COUNT(*) n FROM lh_activity WHERE at >= ? AND at < ? GROUP BY action');
$pv->execute([gmdate('Y-m-d H:i:s', $from - $days * 86400), gmdate('Y-m-d H:i:s', $from)]);
foreach ($pv->fetchAll() as $r) $prev[act_cat((string)$r['action'])] += (int)$r['n'];

$daily = [];
for ($t = $from; $t <= $now + 1; $t += 86400) $daily[$localDay($t)] = $zero;
$daily[$localDay($now)] = $daily[$localDay($now)] ?? $zero;
$heat = array_fill(0, 7, array_fill(0, 24, 0));
$people = [];
$assets = []; $actions = [];
$st = $x->prepare('SELECT at,user_id,action,client_id,client_name,details FROM lh_activity WHERE at >= ? ORDER BY id DESC LIMIT 60000');
$st->execute([gmdate('Y-m-d H:i:s', $from)]);
foreach ($st->fetchAll() as $r) {
  $ts = strtotime($r['at'] . ' UTC'); if ($ts === false) continue;
  $c = act_cat((string)$r['action']);
  $totals[$c]++;
  $d = $localDay($ts); if (isset($daily[$d])) $daily[$d][$c]++;
  $actions[$r['action']] = ($actions[$r['action']] ?? 0) + 1;
  $uid = (int)$r['user_id'];
  if ($uid > 0) {
    $lt = $ts + $tz; $heat[((int)gmdate('N', $lt)) - 1][(int)gmdate('G', $lt)]++;
    if (!isset($people[$uid])) $people[$uid] = ['cats' => $zero, 'total' => 0, 'days' => [], 'clients' => [], 'last_at' => $r['at']];
    $people[$uid]['cats'][$c]++; $people[$uid]['total']++; $people[$uid]['days'][$d] = ($people[$uid]['days'][$d] ?? 0) + 1;
    if ($r['client_name'] !== '') $people[$uid]['clients'][$r['client_name']] = ($people[$uid]['clients'][$r['client_name']] ?? 0) + 1;
  }
  $cid = (string)$r['client_id'];
  if ($cid !== '' && isset($clients[$cid])) {
    $clients[$cid]['events']++;
    if ($c === 'download' || $c === 'customise') $clients[$cid]['downloads']++;
    if ($c === 'view') $clients[$cid]['views']++;
    if (in_array($c, ['add', 'edit', 'delete'], true)) $clients[$cid]['changes']++;
  }
  if (($c === 'download' || $c === 'customise') && $r['action'] !== 'value_copied' && $r['details'] !== '') {
    $k = $r['client_name'] . '|' . substr((string)$r['details'], 0, 120);
    $assets[$k] = ['name' => substr((string)$r['details'], 0, 120), 'client' => $r['client_name'], 'action' => $r['action'], 'n' => ($assets[$k]['n'] ?? 0) + 1];
  }
}
$pOut = [];
foreach ($users as $id => $u) {
  $p = $people[$id] ?? ['cats' => $zero, 'total' => 0, 'days' => [], 'clients' => [], 'last_at' => null];
  arsort($p['clients']);
  $series = []; foreach (array_keys($daily) as $d) $series[] = $p['days'][$d] ?? 0;
  $pOut[] = ['id' => $id, 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role'], 'active' => (int)$u['active'] === 1, 'created_at' => $u['created_at'],
    'total' => $p['total'], 'cats' => $p['cats'], 'days_active' => count($p['days']), 'series' => $series,
    'top_clients' => array_slice(array_map(fn($k, $v) => ['name' => (string)$k, 'n' => $v], array_keys($p['clients']), $p['clients']), 0, 3), 'last_in_period' => $p['last_at']];
}
$last = []; foreach ($x->query('SELECT user_id, MAX(at) last_at FROM lh_activity WHERE user_id > 0 GROUP BY user_id')->fetchAll() as $r) $last[(int)$r['user_id']] = $r['last_at'];
foreach ($pOut as &$p) $p['last_at'] = $last[$p['id']] ?? null;
unset($p);
usort($assets, fn($a, $b) => $b['n'] <=> $a['n']);
arsort($actions);
$recent = $x->query('SELECT id,at,user_id,user_name,role,action,client_id,client_name,details FROM lh_activity ORDER BY id DESC LIMIT 14')->fetchAll();
foreach ($recent as &$r) $r['cat'] = act_cat((string)$r['action']);
unset($r);
out(200, [
  'period' => ['days' => $days, 'from' => gmdate('Y-m-d H:i:s', $from), 'to' => gmdate('Y-m-d H:i:s', $now)],
  'cats' => LH_CATS, 'platform' => $plat, 'storage' => $storage,
  'totals' => $totals, 'prev' => $prev,
  'daily' => array_map(fn($d, $c) => ['d' => $d, 'c' => $c], array_keys($daily), $daily),
  'heat' => $heat, 'people' => $pOut, 'clients' => array_values($clients),
  'top_assets' => array_slice($assets, 0, 10),
  'top_actions' => array_slice(array_map(fn($a, $n) => ['action' => (string)$a, 'cat' => act_cat((string)$a), 'n' => $n], array_keys($actions), $actions), 0, 12),
  'recent' => $recent,
]);
