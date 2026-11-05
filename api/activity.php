<?php
declare(strict_types=1);
/*
 The activity log: who did what, to which client, when, from where.
 GET  (admin)   ?user=<id> &action=<name> &client=<text> &from=YYYY-MM-DD &to=YYYY-MM-DD &before=<id> &limit=<=200  → newest first
      (admin)   ?summary=1   per person: last seen, sign-ins and changes in the last 30 days
      (admin)   ?actions=1   the action names that exist (for the filter)
      (admin)   ?format=csv  same filters, as a spreadsheet file
 POST (signed in)  a few things only the browser can see (SVG downloads, Design Lens checks, errors the screen showed)
*/
require __DIR__ . '/_lib.php';
$x = db();
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  $user = require_login(true);
  $b = body_json();
  $act = (string)($b['action'] ?? '');
  if (!in_array($act, ['svg_download', 'lens_check', 'client_error', 'logo_variants'], true)) out(400, ['error' => 'Unknown event.']);
  $cid = (string)($b['client_id'] ?? '');
  log_activity($act, $user, ['client_id' => valid_client_key($cid) ? $cid : '', 'client_name' => substr((string)($b['client_name'] ?? ''), 0, 190), 'details' => substr((string)($b['details'] ?? ''), 0, 600)]);
  out(200, ['ok' => true]);
}
require_method('GET');
require_admin();
if (!empty($_GET['actions'])) out(200, ['actions' => array_column($x->query('SELECT DISTINCT action FROM lh_activity ORDER BY action')->fetchAll(), 'action')]);
if (!empty($_GET['summary'])) {
  $since = gmdate('Y-m-d H:i:s', time() - 30 * 86400);
  $st = $x->prepare("SELECT user_id, MAX(at) last_at, SUM(action='login') logins, SUM(action='file_uploaded') uploads, SUM(action IN ('client_created','client_updated','client_deleted','client_restored')) changes, SUM(action IN ('client_error','login_failed')) problems FROM lh_activity WHERE at >= ? AND user_id > 0 GROUP BY user_id");
  $st->execute([$since]);
  $out = [];
  foreach ($st->fetchAll() as $r) $out[(string)$r['user_id']] = $r;
  $last = $x->query('SELECT user_id, MAX(at) last_at FROM lh_activity WHERE user_id > 0 GROUP BY user_id')->fetchAll();
  foreach ($last as $r) { $k = (string)$r['user_id']; $out[$k] = ($out[$k] ?? ['user_id' => $r['user_id'], 'logins' => 0, 'uploads' => 0, 'changes' => 0, 'problems' => 0]); $out[$k]['last_at'] = $r['last_at']; }
  out(200, ['summary' => $out]);
}
$w = []; $p = [];
if (!empty($_GET['user'])) { $w[] = 'user_id=?'; $p[] = (int)$_GET['user']; }
if (!empty($_GET['action'])) { $w[] = 'action=?'; $p[] = (string)$_GET['action']; }
if (!empty($_GET['client'])) { $w[] = '(client_name LIKE ? OR client_id=?)'; $p[] = '%' . str_replace(['%', '_'], ['\\%', '\\_'], (string)$_GET['client']) . '%'; $p[] = (string)$_GET['client']; }
if (!empty($_GET['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$_GET['from'])) { $w[] = 'at >= ?'; $p[] = $_GET['from'] . ' 00:00:00'; }
if (!empty($_GET['to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$_GET['to'])) { $w[] = 'at <= ?'; $p[] = $_GET['to'] . ' 23:59:59'; }
if (!empty($_GET['before'])) { $w[] = 'id < ?'; $p[] = (int)$_GET['before']; }
$csv = ($_GET['format'] ?? '') === 'csv';
$limit = $csv ? 5000 : max(1, min(200, (int)($_GET['limit'] ?? 100)));
$st = $x->prepare('SELECT id,at,user_id,user_name,role,action,client_id,client_name,details,ip FROM lh_activity' . ($w ? ' WHERE ' . implode(' AND ', $w) : '') . ' ORDER BY id DESC LIMIT ' . $limit);
$st->execute($p);
$rows = $st->fetchAll();
if ($csv) {
  header('Content-Type: text/csv; charset=utf-8');
  header('Content-Disposition: attachment; filename="latchhub-activity-' . gmdate('Y-m-d') . '.csv"');
  header('Cache-Control: no-store');
  $o = fopen('php://output', 'w');
  fputcsv($o, ['Time (UTC)', 'Person', 'Role', 'Action', 'Client', 'Details', 'IP']);
  $safe = fn($v) => preg_match('/^[=+\-@\t\r]/', (string)$v) ? "'" . $v : $v;   /* a spreadsheet must never run a cell as a formula */
  foreach ($rows as $r) fputcsv($o, [$r['at'], $safe($r['user_name']), $r['role'], $r['action'], $safe($r['client_name']), $safe($r['details']), $r['ip']]);
  fclose($o);
  exit;
}
out(200, ['events' => $rows, 'next' => count($rows) === $limit ? (int)end($rows)['id'] : null]);
