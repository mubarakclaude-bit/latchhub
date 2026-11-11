<?php
declare(strict_types=1);
/*
 The designer's desk – PREVIEW with mock tasks.
 Tasks are not a real table yet: each person's desk is kept as one JSON value in lh_kv (key desk:<user id>), so nothing in the
 database schema changes and the preview can be removed without a trace. Clients, names and the activity log are real.
   GET  ?tz=<minutes east of UTC>      → { user, tasks, clients, now }   (seeds a sample desk the first time)
   POST {action, id, …}                 start | pause | done | wait {why} | resume | pin {plan} | drop {names} | reset
 Every action is written to the activity log (section "Work on tasks").
*/
require __DIR__ . '/_lib.php';
$user = require_login($_SERVER['REQUEST_METHOD'] === 'POST');
$x = db();
$key = 'desk:' . (int)$user['id'];
$body = $_SERVER['REQUEST_METHOD'] === 'POST' ? body_json() : [];
$tz = max(-840, min(840, (int)($_GET['tz'] ?? ($body['tz'] ?? 0)))) * 60;
$now = time();
$localMidnight = function (int $ts) use ($tz): int { return (int)(floor(($ts + $tz) / 86400) * 86400 - $tz); };
$day0 = $localMidnight($now);

/* real clients, for names and the note colours */
$clients = [];
foreach ($x->query('SELECT id,json FROM lh_brands ORDER BY name')->fetchAll() as $r) {
  $b = json_decode($r['json'], true) ?: [];
  if (!empty($b['parent'])) continue;
  $clients[] = ['id' => $r['id'], 'name' => (string)($b['name'] ?? $r['id'])];
}
if (!$clients) $clients = [['id' => 'demo1', 'name' => 'Sample client A'], ['id' => 'demo2', 'name' => 'Sample client B'], ['id' => 'demo3', 'name' => 'Sample client C']];

const DESK_FORMATS = [
  'Reel 9:16' => ['est' => 150, 'd' => [['Reel video', 'MP4 · 1080×1920 · ≤ 60 s', 'video'], ['Cover frame', 'PNG/JPG · 1080×1920', 'image']]],
  'Post 1:1' => ['est' => 75, 'd' => [['Feed image', 'PNG/JPG · 1080×1080', 'image']]],
  'Carousel 4:5' => ['est' => 120, 'd' => [['Slides', 'PNG · 1080×1350 · 3–8 files', 'image']]],
  'Video 16:9' => ['est' => 240, 'd' => [['Video', 'MP4 · 1920×1080', 'video'], ['Thumbnail', 'JPG · 1920×1080', 'image']]],
  'Print' => ['est' => 90, 'd' => [['Print PDF', 'PDF · CMYK · 3 mm bleed', 'pdf'], ['Preview', 'JPG for approval', 'image']]],
];
function desk_seed(array $clients, int $day0, int $uid): array {
  $c = fn(int $i) => $clients[$i % count($clients)];
  $mk = function (string $id, array $cl, string $t, string $fmt, int $dueMin, ?int $planMin, int $dayOff, array $o = []) use ($day0) {
    $f = DESK_FORMATS[$fmt];
    return array_merge(['id' => $id, 'client' => $cl['id'], 'clientName' => $cl['name'], 'title' => $t, 'fmt' => $fmt, 'est' => $f['est'],
      'due' => $day0 + $dayOff * 86400 + $dueMin * 60, 'plan' => $planMin === null ? null : $day0 + $dayOff * 86400 + $planMin * 60,
      'deliv' => array_map(fn($d) => ['n' => $d[0], 'spec' => $d[1], 'kind' => $d[2], 'got' => []], $f['d']),
      'changes' => [], 'spent' => 0, 'runningSince' => null, 'state' => 'pinned', 'waitWhy' => '', 'waitAt' => null, 'doneAt' => null, 'round' => 1], $o);
  };
  $n = 140 + $uid * 7;
  return [
    $mk('T-' . ($n + 2), $c(0), 'Festive reel – Round 2', 'Reel 9:16', 1080, 660, 0, ['round' => 2, 'changes' => ['Logo into the safe zone', 'Date in the brand gold']]),
    $mk('T-' . ($n + 7), $c(1), 'Booth loop – final export', 'Video 16:9', 960, null, 0, ['state' => 'tray', 'est' => 60]),
    $mk('T-' . ($n + 11), $c(2), 'Campus tour – rough cut', 'Video 16:9', 1080, 840, 0),
    $mk('T-' . ($n - 1), $c(3), 'Webinar intro sting', 'Video 16:9', 1020, 540, 0, ['state' => 'done', 'spent' => 48, 'est' => 45, 'doneAt' => $day0 + 571 * 60]),
    $mk('T-' . ($n + 15), $c(4), 'Annual Day highlights', 'Reel 9:16', 1080, null, 2, ['state' => 'soon']),
    $mk('T-' . ($n + 16), $c(0), 'Teaser – second property', 'Reel 9:16', 1080, null, 3, ['state' => 'soon']),
  ];
}
function desk_load(PDO $x, string $key): ?array { $q = $x->prepare('SELECT v FROM lh_kv WHERE k=?'); $q->execute([$key]); $r = $q->fetch(); return $r ? (json_decode($r['v'], true) ?: null) : null; }
function desk_save(PDO $x, string $key, array $tasks): void { $x->prepare('REPLACE INTO lh_kv (k,v,exp) VALUES (?,?,0)')->execute([$key, json_encode($tasks, JSON_UNESCAPED_UNICODE)]); }

$tasks = desk_load($x, $key);
/* a desk seeded on another day rolls over: unfinished notes come back pinned at 09:00 */
if ($tasks && ($tasks[0]['due'] ?? 0) < $day0 - 86400 * 0 && max(array_column($tasks, 'due')) < $day0) {
  foreach ($tasks as &$t) { if ($t['state'] !== 'done') { $t['due'] = $day0 + 1080 * 60; if ($t['plan'] !== null) $t['plan'] = $day0 + 540 * 60; } }
  unset($t); desk_save($x, $key, $tasks);
}
if (!$tasks) { $tasks = desk_seed($clients, $day0, (int)$user['id']); desk_save($x, $key, $tasks); }

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $b = $body;
  $act = (string)($b['action'] ?? '');
  if ($act === 'reset') { $tasks = desk_seed($clients, $day0, (int)$user['id']); desk_save($x, $key, $tasks); log_activity('desk_reset', $user, ['details' => 'Sample desk reset']); out(200, ['ok' => true, 'tasks' => $tasks, 'now' => $now]); }
  $id = (string)($b['id'] ?? '');
  $i = array_search($id, array_column($tasks, 'id'), true);
  if ($i === false) out(404, ['error' => 'That note is not on your desk.']);
  $t = &$tasks[$i];
  $cn = ['client_id' => $t['client'], 'client_name' => $t['clientName']];
  $settle = function (array &$t) use ($now) { if ($t['runningSince']) { $t['spent'] += max(0, ($now - (int)$t['runningSince']) / 60); $t['runningSince'] = null; } };
  switch ($act) {
    case 'start':
      if ($t['state'] === 'waiting') out(400, ['error' => 'This note is waiting on the manager – resume it first.']);
      foreach ($tasks as &$o) { if ($o['runningSince'] && $o['id'] !== $id) { $settle($o); log_activity('task_paused', $user, ['client_id' => $o['client'], 'client_name' => $o['clientName'], 'details' => $o['title'] . ' · ' . round($o['spent']) . ' min so far (switched task)']); } } unset($o);
      if ($t['state'] === 'tray') $t['state'] = 'pinned';
      if ($t['plan'] === null || $t['plan'] > $now) $t['plan'] = $now;
      $t['runningSince'] = $now;
      log_activity('task_started', $user, $cn + ['details' => $t['title'] . ($t['spent'] ? ' · resumed at ' . round($t['spent']) . ' min' : ' · first start') . ' · due ' . gmdate('H:i', $t['due'] + $tz)]);
      break;
    case 'pause': $settle($t); log_activity('task_paused', $user, $cn + ['details' => $t['title'] . ' · ' . round($t['spent']) . ' min so far']); break;
    case 'done':
      $settle($t); $t['state'] = 'done'; $t['doneAt'] = $now;
      $early = (int)round(($t['due'] - $now) / 60);
      log_activity('task_done', $user, $cn + ['details' => $t['title'] . ' · took ' . round($t['spent']) . ' min (usual ' . $t['est'] . ') · ' . ($early >= 0 ? $early . ' min early' : abs($early) . ' min late') . ' · submitted']);
      break;
    case 'wait':
      $settle($t); $t['state'] = 'waiting'; $t['waitWhy'] = substr(trim((string)($b['why'] ?? 'Need something')), 0, 80); $t['waitAt'] = $now;
      log_activity('task_waiting', $user, $cn + ['details' => $t['title'] . ' · ' . $t['waitWhy'] . ' · manager nudged']);
      break;
    case 'resume':
      $t['state'] = 'pinned'; $waited = $t['waitAt'] ? round(($now - (int)$t['waitAt']) / 60) : 0; $t['waitAt'] = null;
      if ($t['plan'] === null || $t['plan'] < $now) $t['plan'] = $now;
      log_activity('task_resumed', $user, $cn + ['details' => $t['title'] . ' · waited ' . $waited . ' min for: ' . $t['waitWhy']]); $t['waitWhy'] = '';
      break;
    case 'pin':
      $plan = (int)($b['plan'] ?? 0); if ($plan < $day0 || $plan > $day0 + 7 * 86400) out(400, ['error' => 'Pick a time today or this week.']);
      $t['plan'] = $plan; if ($t['state'] === 'tray' || $t['state'] === 'soon') $t['state'] = 'pinned';
      log_activity('task_pinned', $user, $cn + ['details' => $t['title'] . ' · planned for ' . gmdate('D H:i', $plan + $tz)]);
      break;
    case 'drop':
      $names = array_slice(array_map('strval', (array)($b['names'] ?? [])), 0, 20); $filed = [];
      foreach ($names as $n) {
        $ext = strtolower(pathinfo($n, PATHINFO_EXTENSION)); $kind = in_array($ext, ['mp4', 'mov', 'm4v'], true) ? 'video' : (in_array($ext, ['png', 'jpg', 'jpeg', 'webp'], true) ? 'image' : ($ext === 'pdf' ? 'pdf' : ''));
        foreach ($t['deliv'] as &$d) { if ($d['kind'] === $kind && (!$d['got'] || $d['n'] === 'Slides')) { $d['got'][] = safe_name($n); $filed[] = $d['n']; break; } } unset($d);
      }
      log_activity('task_files', $user, $cn + ['details' => $t['title'] . ' · ' . count($names) . ' file' . (count($names) === 1 ? '' : 's') . ' → ' . ($filed ? implode(', ', array_unique($filed)) : 'no deliverable matched') . ' (preview: not sent to Zoho)']);
      break;
    default: out(400, ['error' => 'Unknown action.']);
  }
  unset($t);
  desk_save($x, $key, $tasks);
  out(200, ['ok' => true, 'tasks' => $tasks, 'now' => $now]);
}
require_method('GET');
out(200, ['user' => ['id' => (int)$user['id'], 'name' => $user['name'], 'role' => $user['role']], 'tasks' => $tasks, 'clients' => $clients, 'now' => $now]);
