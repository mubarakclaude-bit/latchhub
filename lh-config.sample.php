<?php
/*
 Copy this file to  lh-config.php  ONE LEVEL ABOVE public_html (so it is not reachable from the web), then fill it in.
 NEVER commit lh-config.php to git.
*/
return [
  'db' => ['host' => 'localhost', 'name' => 'u123456789_latchhub', 'user' => 'u123456789_latchhub', 'pass' => 'DATABASE_PASSWORD'],
  'zoho' => [
    'client_id'      => 'PASTE_CLIENT_ID',
    'client_secret'  => 'PASTE_CLIENT_SECRET',
    'refresh_token'  => 'PASTE_REFRESH_TOKEN',
    'root_folder_id' => 'vpa8le8dbd6f43476449c80494919e03617e6',
    'accounts' => 'https://accounts.zoho.in',
    'api'      => 'https://www.zohoapis.in/workdrive/api/v1',
    'download' => 'https://download.zoho.in/v1/workdrive/download/',
  ],
  'setup_token'   => 'MAKE_UP_A_LONG_RANDOM_STRING_OF_20+_CHARACTERS',
  'max_upload_mb' => 200,
];
