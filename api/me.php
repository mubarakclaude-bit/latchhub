<?php
declare(strict_types=1);
require __DIR__ . '/_lib.php';
$u = current_user();
if (!$u) out(401, ['error' => 'Please sign in.']);
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24));
out(200, ['user' => ['id' => (int)$u['id'], 'email' => $u['email'], 'name' => $u['name'], 'role' => $u['role']], 'csrf' => $_SESSION['csrf']]);
