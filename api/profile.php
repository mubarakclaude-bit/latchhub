<?php
declare(strict_types=1);
/* A signed-in person changes the name the team sees (in the top bar, the activity log and the admin page).
   POST {name}  → {ok, name}. The email (used to sign in) stays the same. */
require __DIR__ . '/_lib.php';
require_method('POST');
$user = require_login(true);
$b = body_json();
$name = clean_person_name((string)($b['name'] ?? ''));
if ($name === '') out(400, ['error' => 'Type your name (1–60 characters).']);
if ($name === $user['name']) out(200, ['ok' => true, 'name' => $name]);
db()->prepare('UPDATE lh_users SET name=? WHERE id=?')->execute([$name, (int)$user['id']]);
log_activity('name_changed', ['name' => $name] + $user, ['details' => '"' . $user['name'] . '" → "' . $name . '"']);
out(200, ['ok' => true, 'name' => $name]);
