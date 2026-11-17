<?php
declare(strict_types=1);
/* Admin only: list people, add a person (admin, project manager or designer), change a role, rename someone, reset a password, switch someone off/on. */
require __DIR__ . '/_lib.php';
$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method === 'GET') {
  require_admin();
  $rows = db()->query('SELECT id,email,name,role,active,created_at FROM lh_users ORDER BY role, name')->fetchAll();
  out(200, ['users' => $rows]);
}
require_method('POST');
$me = require_admin(true);
$b = body_json();
$act = (string)($b['action'] ?? '');
$x = db();
$checkPw = function (string $p) { if (strlen($p) < 10) out(400, ['error' => 'Use a password of at least 10 characters.']); };
if ($act === 'create') {
  $email = strtolower(trim((string)($b['email'] ?? '')));
  $name = clean_person_name((string)($b['name'] ?? ''));
  $role = isset(LH_ROLES[(string)($b['role'] ?? '')]) ? (string)$b['role'] : 'designer';
  if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $name === '') out(400, ['error' => 'A valid email and a name are required.']);
  $checkPw((string)($b['password'] ?? ''));
  $c = $x->prepare("SELECT COUNT(*) c FROM lh_users WHERE active=1 AND role<>'admin'");
  $c->execute();
  if ($role !== 'admin' && (int)$c->fetch()['c'] >= 10) out(400, ['error' => 'The team has ten places for designers and project managers (plus the admin). Switch someone off first.']);
  try { $x->prepare('INSERT INTO lh_users (email,name,role,pass_hash,active,created_at) VALUES (?,?,?,?,1,?)')->execute([$email, $name, $role, password_hash((string)$b['password'], PASSWORD_DEFAULT), now()]); }
  catch (Throwable $e) { out(409, ['error' => 'That email already has an account.']); }
  log_activity('user_created', $me, ['details' => $name . ' <' . $email . '> as ' . strtolower(LH_ROLES[$role])]);
  out(200, ['ok' => true]);
}
$id = (int)($b['id'] ?? 0);
if ($id < 1) out(400, ['error' => 'Missing user id.']);
$tu = $x->prepare('SELECT name,email,role FROM lh_users WHERE id=?'); $tu->execute([$id]); $target = $tu->fetch() ?: ['name' => '?', 'email' => '?', 'role' => ''];
if ($act === 'role') {
  $role = (string)($b['role'] ?? '');
  if (!isset(LH_ROLES[$role])) out(400, ['error' => 'Unknown role.']);
  if ($id === (int)$me['id']) out(400, ['error' => 'You cannot change your own role.']);
  if ($target['role'] === '') out(404, ['error' => 'No such person.']);
  if ($target['role'] === $role) out(200, ['ok' => true, 'role' => $role]);
  $x->prepare('UPDATE lh_users SET role=? WHERE id=?')->execute([$role, $id]);
  log_activity('user_role_changed', $me, ['details' => $target['name'] . ' <' . $target['email'] . '>: ' . strtolower(LH_ROLES[$target['role']] ?? $target['role']) . ' → ' . strtolower(LH_ROLES[$role])]);
  out(200, ['ok' => true, 'role' => $role]);
}
if ($act === 'rename') {
  $name = clean_person_name((string)($b['name'] ?? ''));
  if ($name === '') out(400, ['error' => 'Type a name (1–60 characters).']);
  $x->prepare('UPDATE lh_users SET name=? WHERE id=?')->execute([$name, $id]);
  log_activity('user_renamed', $me, ['details' => '"' . $target['name'] . '" → "' . $name . '" <' . $target['email'] . '>']);
  out(200, ['ok' => true, 'name' => $name]);
}
if ($act === 'password') { $checkPw((string)($b['password'] ?? '')); $x->prepare('UPDATE lh_users SET pass_hash=? WHERE id=?')->execute([password_hash((string)$b['password'], PASSWORD_DEFAULT), $id]); log_activity('password_reset', $me, ['details' => 'for ' . $target['name'] . ' <' . $target['email'] . '>']); out(200, ['ok' => true]); }
if ($act === 'active') {
  if ($id === (int)$me['id']) out(400, ['error' => 'You cannot switch yourself off.']);
  $x->prepare('UPDATE lh_users SET active=? WHERE id=?')->execute([!empty($b['active']) ? 1 : 0, $id]);
  log_activity(!empty($b['active']) ? 'user_switched_on' : 'user_switched_off', $me, ['details' => $target['name'] . ' <' . $target['email'] . '>']);
  out(200, ['ok' => true]);
}
out(400, ['error' => 'Unknown action.']);
