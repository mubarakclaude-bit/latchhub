<?php
declare(strict_types=1);
/*
 The activity log: who did what, to which client, when, from where.
 GET  (admin)   ?user=<id> &action=<name> &client=<text> &from=YYYY-MM-DD &to=YYYY-MM-DD &before=<id> &limit=<=200  → newest first
      (admin)   ?summary=1   per person: last seen, sign-ins and changes in the last 30 days
      (admin)   ?actions=1   the action names that exist (for the filter)
      (admin)   ?format=csv  same filters, as a spreadsheet file
 GET  (admin)   &cat=<add|edit|delete|download|customise|view|check|auth|admin|error>  one section only;  &q=<text>  search the details
 POST (signed in)  the things only the browser can see: clients opened, files downloaded, values copied, logos recoloured,
                   icons made, Design Lens checks, Smart imports, errors the screen showed
 Every event carries "cat" – the dashboard section it belongs to (see act_cat in _lib.php).
*/
const LH_BROWSER_EVENTS = ['client_opened', 'section_viewed', 'link_opened', 'logo_download', 'element_download', 'font_download', 'brand_book_download', 'swatch_download', 'asset_download',
  'value_copied', 'svg_download', 'logo_variants', 'icon_created', 'lens_check', 'smart_import', 'client_error', 'backup_download', 'backup_restored'];
require __DIR__ . '/_lib.php';
$x = db();
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  $user = require_login(true);
  $b = body_json();
  $act = (string)($b['action'] ?? '');
  if (!in_array($act, LH_BROWSER_EVENTS, true)) out(400, ['error' => 'Unknown event.']);
  if (in_array($act, ['backup_download', 'backup_restored'], true) && $user['role'] !== 'admin') out(403, ['error' => 'Admins only.']);
  $cid = (string)($b['client_id'] ?? '');
  $det = substr((string)($b['details'] ?? ''), 0, 600);
  /* the same click twice within a few seconds (double click, re-render) is recorded once */
  $dup = $x->prepare('SELECT 1 FROM lh_activity WHERE user_id=? AND action=? AND details=? AND at >= ? LIMIT 1');
  $dup->execute([(int)$user['id'], $act, $det, gmdate('Y-m-d H:i:s', time() - 4)]);
  if ($dup->fetch()) out(200, ['ok' => true, 'duplicate' => true]);
  log_activity($act, $user, ['client_id' => valid_client_key($cid) ? $cid : '', 'client_name' => substr((string)($b['client_name'] ?? ''), 0, 190), 'details' => $det]);
  out(200, ['ok' => true]);
}
require_method('GET');
require_admin();
$allActs = array_column($x->query('SELECT DISTINCT action FROM lh_activity ORDER BY action')->fetchAll(), 'action');
if (!empty($_GET['actions'])) out(200, ['actions' => $allActs, 'cats' => array_map(fn($a) => act_cat($a), array_combine($allActs, $allActs) ?: []), 'labels' => LH_CATS]);
if (!empty($_GET['summary'])) {
  $st = $x->prepare('SELECT user_id, action FROM lh_activity WHERE at >= ? AND user_id > 0');
  $st->execute([gmdate('Y-m-d H:i:s', time() - 30 * 86400)]);
  $out = [];
  $blank = fn($id) => ['user_id' => $id, 'logins' => 0, 'uploads' => 0, 'changes' => 0, 'problems' => 0, 'last_at' => null];
  foreach ($st->fetchAll() as $r) {
    $k = (string)$r['user_id']; $out[$k] = $out[$k] ?? $blank($r['user_id']); $c = act_cat((string)$r['action']);
    if ($r['action'] === 'login') $out[$k]['logins']++;
    if ($r['action'] === 'file_uploaded') $out[$k]['uploads']++;
    if (in_array($c, ['add', 'edit', 'delete'], true) && $r['action'] !== 'file_uploaded') $out[$k]['changes']++;
    if ($c === 'error') $out[$k]['problems']++;
  }
  foreach ($x->query('SELECT user_id, MAX(at) last_at FROM lh_activity WHERE user_id > 0 GROUP BY user_id')->fetchAll() as $r) { $k = (string)$r['user_id']; $out[$k] = $out[$k] ?? $blank($r['user_id']); $out[$k]['last_at'] = $r['last_at']; }
  out(200, ['summary' => $out]);
}
$w = []; $p = [];
if (!empty($_GET['user'])) { $w[] = 'user_id=?'; $p[] = (int)$_GET['user']; }
if (!empty($_GET['action'])) { $w[] = 'action=?'; $p[] = (string)$_GET['action']; }
if (!empty($_GET['client'])) { $w[] = '(client_name LIKE ? OR client_id=?)'; $p[] = '%' . str_replace(['%', '_'], ['\\%', '\\_'], (string)$_GET['client']) . '%'; $p[] = (string)$_GET['client']; }
if (!empty($_GET['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$_GET['from'])) { $w[] = 'at >= ?'; $p[] = $_GET['from'] . ' 00:00:00'; }
if (!empty($_GET['to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$_GET['to'])) { $w[] = 'at <= ?'; $p[] = $_GET['to'] . ' 23:59:59'; }
if (!empty($_GET['before'])) { $w[] = 'id < ?'; $p[] = (int)$_GET['before']; }
if (!empty($_GET['cat']) && isset(LH_CATS[(string)$_GET['cat']])) {
  $in = array_values(array_filter($allActs, fn($a) => act_cat($a) === (string)$_GET['cat']));
  if (!$in) $w[] = '1=0'; else { $w[] = 'action IN (' . implode(',', array_fill(0, count($in), '?')) . ')'; array_push($p, ...$in); }
}
if (isset($_GET['q']) && trim((string)$_GET['q']) !== '') { $w[] = '(details LIKE ? OR client_name LIKE ? OR user_name LIKE ?)'; $q = '%' . str_replace(['%', '_'], ['\\%', '\\_'], trim((string)$_GET['q'])) . '%'; array_push($p, $q, $q, $q); }
$csv = ($_GET['format'] ?? '') === 'csv';
$limit = $csv ? 5000 : max(1, min(200, (int)($_GET['limit'] ?? 100)));
$st = $x->prepare('SELECT id,at,user_id,user_name,role,action,client_id,client_name,details,ip FROM lh_activity' . ($w ? ' WHERE ' . implode(' AND ', $w) : '') . ' ORDER BY id DESC LIMIT ' . $limit);
$st->execute($p);
$rows = $st->fetchAll();
foreach ($rows as &$r) $r['cat'] = act_cat((string)$r['action']);
unset($r);
if ($csv) {
  header('Content-Type: text/csv; charset=utf-8');
  header('Content-Disposition: attachment; filename="latchhub-activity-' . gmdate('Y-m-d') . '.csv"');
  header('Cache-Control: no-store');
  $o = fopen('php://output', 'w');
  fputcsv($o, ['Time (UTC)', 'Person', 'Role', 'Section', 'Action', 'Client', 'Details', 'IP']);
  $safe = fn($v) => preg_match('/^[=+\-@\t\r]/', (string)$v) ? "'" . $v : $v;   /* a spreadsheet must never run a cell as a formula */
  foreach ($rows as $r) fputcsv($o, [$r['at'], $safe($r['user_name']), $r['role'], LH_CATS[$r['cat']] ?? $r['cat'], $r['action'], $safe($r['client_name']), $safe($r['details']), $r['ip']]);
  fclose($o);
  exit;
}
out(200, ['events' => $rows, 'next' => count($rows) === $limit ? (int)end($rows)['id'] : null]);
