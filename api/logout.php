<?php
declare(strict_types=1);
require __DIR__ . '/_lib.php';
require_method('POST');
start_session();
check_csrf();
$_SESSION = [];
session_destroy();
out(200, ['ok' => true]);
