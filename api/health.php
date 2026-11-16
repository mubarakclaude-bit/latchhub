<?php
declare(strict_types=1);
/* Admin only: proves the whole chain works – database, Zoho login, the LatchHub folder – and shows what this server can compress. */
require __DIR__ . '/_lib.php';
require_admin();
$r = ['php' => PHP_VERSION, 'checks' => []];
$ok = function (string $n, bool $good, string $note = '') use (&$r) { $r['checks'][] = ['check' => $n, 'ok' => $good, 'note' => $note]; };
$ok('PHP curl extension', function_exists('curl_init'));
$ok('Image compression (GD)', function_exists('imagecreatefromstring'), function_exists('imagecreatefromstring') ? '' : 'Images will be stored without compression.');
$ok('JPEG orientation fix (exif)', function_exists('exif_read_data'), 'Optional.');
$gs = gs_path();
$ok('PDF compression (Ghostscript)', $gs !== '', $gs !== '' ? $gs : 'Not available: PDFs will be stored as uploaded. Compress big PDFs before uploading, or ask Hostinger support whether exec() can be enabled.');
$lim = min(ini_bytes((string)ini_get('upload_max_filesize')), ini_bytes((string)ini_get('post_max_size')));
$ok('Upload size limit (brand books need about 32M or more)', $lim >= 32 * 1048576, 'upload_max_filesize=' . ini_get('upload_max_filesize') . ', post_max_size=' . ini_get('post_max_size') . ($lim >= 32 * 1048576 ? '' : ' – too small: raise both to 64M in hPanel → PHP Configuration, otherwise brand books and big logos will not upload.'));
try { db()->query('SELECT 1'); $ok('Database', true); } catch (Throwable $e) { $ok('Database', false, 'Connection failed'); }
try { $nb = (int)db()->query('SELECT COUNT(*) c FROM lh_brands')->fetch()['c']; $ok('Shared clients table', true, $nb . ' client(s) saved on the server'); } catch (Throwable $e) { $ok('Shared clients table', false, 'Missing – clients are not shared between designers or sent to Zoho until this is fixed.'); }
$z = cfg()['zoho'];
$ok('Zoho settings present', !empty($z['client_id']) && !empty($z['client_secret']) && !empty($z['refresh_token']) && !empty($z['root_folder_id']));
$t = zoho_token(true);
$ok('Zoho sign-in (refresh token)', $t !== '');
[$s, $j] = zoho_api('GET', '/files/' . rawurlencode($z['root_folder_id']));
$ok('LatchHub folder readable', $s === 200, $s === 200 ? 'Folder name: ' . ($j['data']['attributes']['name'] ?? '?') : 'HTTP ' . $s . ' – check the folder id and that the Zoho user can open it.');
if ($s === 200) { [$s2, $j2] = zoho_api('GET', '/files/' . rawurlencode($z['root_folder_id']) . '/files', null, ['page' => ['limit' => 5, 'offset' => 0]]); $ok('Folder listing', $s2 === 200, $s2 === 200 ? count($j2['data'] ?? []) . ' item(s) shown (first 5)' : 'HTTP ' . $s2); }
/* Files: uploads are delivered to Zoho in the background; the cron job is the safety net when nobody has the site open */
try {
  $cl = db()->query("SELECT v FROM lh_kv WHERE k='cron_last'")->fetch(); $w = db()->query("SELECT COUNT(*) c FROM lh_uploads WHERE state='queued'")->fetch();
  $age = $cl ? time() - (int)strtotime((string)$cl['v']) : -1;
  $ok('Background job (Files → Zoho safety net)', $cl && $age < 3600, ($cl ? 'last ran ' . ($age < 120 ? 'just now' : round($age / 60) . ' min ago') : 'has never run – add the cron job (docs/ZOHO-SETUP.md, "Files section")') . ' · ' . (int)$w['c'] . ' file(s) waiting to reach Zoho');
} catch (Throwable $e) { $ok('Background job (Files → Zoho safety net)', false, 'could not read its status'); }
$r['all_ok'] = !in_array(false, array_column(array_filter($r['checks'], fn($c) => !in_array($c['check'], ['JPEG orientation fix (exif)', 'PDF compression (Ghostscript)', 'Upload size limit (brand books need about 32M or more)', 'Background job (Files → Zoho safety net)'], true)), 'ok'), true);
out(200, $r);
