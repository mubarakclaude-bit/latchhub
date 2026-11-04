<?php
declare(strict_types=1);
/* ONE-TIME SETUP. Open  /api/setup.php?token=<setup_token from lh-config.php>  in the browser and create the first admin. Afterwards blank the setup_token in lh-config.php. */
require __DIR__ . '/_lib.php';
$cfg = cfg();
$tok = (string)($cfg['setup_token'] ?? '');
$given = (string)($_GET['token'] ?? ($_POST['token'] ?? ''));
function page(string $body): void { header('Content-Type: text/html; charset=utf-8'); echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LatchHub setup</title><body style="font:16px system-ui;max-width:460px;margin:48px auto;padding:0 16px">' . $body; exit; }
if ($tok === '' || strlen($tok) < 16) page('<h2>Setup is switched off</h2><p>Set a long <code>setup_token</code> in lh-config.php first.</p>');
if (!hash_equals($tok, $given)) { http_response_code(403); page('<h2>Wrong or missing token</h2>'); }
ensure_schema();
$has = (int)db()->query("SELECT COUNT(*) c FROM lh_users WHERE role='admin'")->fetch()['c'];
if ($has) page('<h2>Already set up</h2><p>An admin exists, so this page is locked. To switch it off completely, set <code>&#39;setup_token&#39; =&gt; &#39;&#39;</code> in lh-config.php.</p>');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  $email = strtolower(trim((string)($_POST['email'] ?? ''))); $name = trim((string)($_POST['name'] ?? '')); $pw = (string)($_POST['password'] ?? '');
  if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $name === '' || strlen($pw) < 10) page('<h2>Check the form</h2><p>Valid email, a name, and a password of at least 10 characters.</p><p><a href="">Back</a></p>');
  db()->prepare("INSERT INTO lh_users (email,name,role,pass_hash,active,created_at) VALUES (?,?, 'admin', ?,1,?)")->execute([$email, $name, password_hash($pw, PASSWORD_DEFAULT), now()]);
  page('<h2>Admin created</h2><p>Tables are ready. Now set <code>&#39;setup_token&#39; =&gt; &#39;&#39;</code> in lh-config.php to switch this page off, then open <b>/admin.html</b> and sign in.</p>');
}
page('<h2>LatchHub setup</h2><p>Create the first admin account.</p><form method="post"><input type="hidden" name="token" value="' . htmlspecialchars($given, ENT_QUOTES) . '"><p><input name="name" placeholder="Your name" required style="width:100%;padding:10px"></p><p><input name="email" type="email" placeholder="Email" required style="width:100%;padding:10px"></p><p><input name="password" type="password" placeholder="Password (10+ characters)" required minlength="10" style="width:100%;padding:10px"></p><p><button style="padding:10px 18px">Create admin</button></p></form>');
