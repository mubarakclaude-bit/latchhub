<?php
declare(strict_types=1);
/* A signed-in person changes their own password: they must give the old one. (Forgotten? The admin sets a new one on the admin page.) */
require __DIR__ . '/_lib.php';
require_method('POST');
$user = require_login(true);
$b = body_json();
$old = (string)($b['old'] ?? '');
$new = (string)($b['new'] ?? '');
$x = db();
$ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
$x->prepare('DELETE FROM lh_attempts WHERE ts < ?')->execute([time() - 900]);
$n = $x->prepare('SELECT COUNT(*) c FROM lh_attempts WHERE email=?');
$n->execute(['pw:' . $user['email']]);
if ((int)$n->fetch()['c'] >= 5) out(429, ['error' => 'Too many wrong tries. Wait 15 minutes, or ask the admin to set a new password.']);
$st = $x->prepare('SELECT pass_hash FROM lh_users WHERE id=?');
$st->execute([(int)$user['id']]);
$row = $st->fetch();
if (!$row || !password_verify($old, $row['pass_hash'])) {
  $x->prepare('INSERT INTO lh_attempts (ip,email,ts) VALUES (?,?,?)')->execute([$ip, 'pw:' . $user['email'], time()]);
  log_activity('password_change_failed', $user, ['details' => 'Wrong old password']);
  out(400, ['error' => 'The old password is not right.']);
}
if (strlen($new) < 10) out(400, ['error' => 'Use a new password of at least 10 characters.']);
if ($new === $old) out(400, ['error' => 'The new password must be different from the old one.']);
$x->prepare('UPDATE lh_users SET pass_hash=? WHERE id=?')->execute([password_hash($new, PASSWORD_DEFAULT), (int)$user['id']]);
log_activity('password_changed', $user, ['details' => 'Changed their own password']);
out(200, ['ok' => true]);
