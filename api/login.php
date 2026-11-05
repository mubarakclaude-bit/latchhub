<?php
declare(strict_types=1);
require __DIR__ . '/_lib.php';
require_method('POST');
$b = body_json();
$email = strtolower(trim((string)($b['email'] ?? '')));
$pass = (string)($b['password'] ?? '');
$ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
$x = db();
$x->prepare('DELETE FROM lh_attempts WHERE ts < ?')->execute([time() - 900]);
$n = $x->prepare('SELECT COUNT(*) c FROM lh_attempts WHERE ip=? OR email=?');
$n->execute([$ip, $email]);
if ((int)$n->fetch()['c'] >= 8) { log_activity('login_blocked', null, ['who' => substr($email, 0, 120), 'details' => 'Too many attempts – locked for 15 minutes']); out(429, ['error' => 'Too many attempts. Wait 15 minutes and try again.']); }
$st = $x->prepare('SELECT id,email,name,role,pass_hash,active FROM lh_users WHERE email=?');
$st->execute([$email]);
$u = $st->fetch();
if (!$u || !(int)$u['active'] || !password_verify($pass, $u['pass_hash'])) {
  $x->prepare('INSERT INTO lh_attempts (ip,email,ts) VALUES (?,?,?)')->execute([$ip, $email, time()]);
  log_activity('login_failed', null, ['who' => substr($email, 0, 120), 'details' => 'Wrong email or password' . ($u && !(int)$u['active'] ? ' (account is switched off)' : '')]);
  out(401, ['error' => 'Wrong email or password.']);
}
start_session();
session_regenerate_id(true);
$_SESSION['uid'] = (int)$u['id'];
$_SESSION['csrf'] = bin2hex(random_bytes(24));
log_activity('login', $u, ['details' => 'Signed in']);
out(200, ['user' => ['id' => (int)$u['id'], 'email' => $u['email'], 'name' => $u['name'], 'role' => $u['role']], 'csrf' => $_SESSION['csrf']]);
