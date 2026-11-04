<?php
declare(strict_types=1);
/* GET api/files.php?client=<brand id>  →  the files in that client's Zoho folder */
require __DIR__ . '/_lib.php';
require_method('GET');
require_login();
$key = (string)($_GET['client'] ?? '');
if (!valid_client_key($key)) out(400, ['error' => 'Missing or invalid client.']);
$folder = client_folder($key, (string)($_GET['name'] ?? $key), false);
if (!$folder) out(200, ['folder' => null, 'files' => []]);
out(200, ['folder' => $folder, 'files' => zoho_list($folder)]);
