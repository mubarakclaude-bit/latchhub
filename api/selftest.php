<?php
declare(strict_types=1);
/* Admin only (POST): really creates a folder in Zoho, uploads a tiny file, reads it back and compares – showing which step fails and what Zoho answered. */
require __DIR__ . '/_lib.php';
require_method('POST');
require_admin(true);
$steps = [];
$step = function (string $n, bool $ok, string $note = '') use (&$steps) { $steps[] = ['step' => $n, 'ok' => $ok, 'note' => $note]; return $ok; };
$done = function () use (&$steps) { out(200, ['all_ok' => !in_array(false, array_column($steps, 'ok'), true), 'steps' => $steps]); };
$root = cfg()['zoho']['root_folder_id'];
try { $folder = ensure_path($root, '_LatchHub self-test', true); } catch (Throwable $e) { $folder = null; }
if (!$step('Create (or find) the folder "_LatchHub self-test" inside LatchHub', (bool)$folder, $folder ? 'folder id ' . $folder : 'Zoho refused to create it – see the server error log, or check that the Zoho user may create folders here.')) $done();
$name = 'selftest-' . date('His') . '.txt';
$body = 'LatchHub self-test ' . date('c');
$tmp = tempnam(sys_get_temp_dir(), 'lhs'); file_put_contents($tmp, $body);
[$st, $raw, $j] = zoho_upload($folder, $tmp, $name);
@unlink($tmp);
if (!$step('Upload a small file', in_array($st, [200, 201], true), 'HTTP ' . $st . ' – Zoho said: ' . substr(preg_replace('/\s+/', ' ', $raw), 0, 260))) $done();
$id = pick_id($j) ?? '';
$fromReply = $id !== '';
if ($id === '') $id = zoho_find_id($folder, $name);
if (!$step('Find the uploaded file\'s id', $id !== '', $id !== '' ? ($fromReply ? 'taken from Zoho\'s reply' : 'not in Zoho\'s reply, found by listing the folder') . ': ' . $id : 'The file is not in the folder – Zoho accepted the upload but it did not appear.')) $done();
$ch = curl_init(rtrim(cfg()['zoho']['download'], '/') . '/' . rawurlencode($id));
curl_setopt_array($ch, [CURLOPT_HTTPHEADER => ['Authorization: Zoho-oauthtoken ' . zoho_token()], CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_UNRESTRICTED_AUTH => true, CURLOPT_MAXREDIRS => 3, CURLOPT_TIMEOUT => 60]);
$got = curl_exec($ch); $dst = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $hops = (int)curl_getinfo($ch, CURLINFO_REDIRECT_COUNT); $host = (string)parse_url((string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL), PHP_URL_HOST); curl_close($ch);
$okDl = $step('Download it back and compare', $dst === 200 && $got === $body, 'HTTP ' . $dst . ' from ' . $host . ($hops ? ' after ' . $hops . ' redirect(s)' : '') . ($dst === 200 ? ($got === $body ? ', content identical' : ', but the content differs') : ' – Zoho said: ' . substr(preg_replace('/\s+/', ' ', (string)$got), 0, 240)));
$newName = 'selftest-renamed-' . date('His') . '.txt';
[$rok, $rcode, $rraw] = zoho_rename($id, $newName);
$seen = false; if ($rok) foreach (zoho_list($folder) as $it) { if ($it['id'] === $id && $it['name'] === $newName) $seen = true; }
$step('Rename a file or folder (used when a client is renamed)', $rok && $seen, 'HTTP ' . $rcode . ($rok && $seen ? ', the new name shows in the folder' : ($rok ? ', but the old name is still listed' : ' – Zoho said: ' . substr(preg_replace('/\\s+/', ' ', $rraw), 0, 200))));
$name2 = 'selftest-trash-' . date('His') . '.txt'; $tmp2 = tempnam(sys_get_temp_dir(), 'lhs'); file_put_contents($tmp2, 'to be trashed');
[$s2, $r2, $j2] = zoho_upload($folder, $tmp2, $name2); @unlink($tmp2);
$id2 = pick_id($j2) ?? zoho_find_id($folder, $name2);
if ($id2 !== '') {
  [$tok, $tcode, $traw] = zoho_trash($id2);
  $gone = true; foreach (zoho_list($folder) as $it) { if ($it['id'] === $id2) $gone = false; }
  $step('Move a file to the WorkDrive trash (used when something is deleted in the app)', $tok && $gone, 'HTTP ' . $tcode . ($tok && $gone ? ', the file left the folder' : ($tok ? ', but the file is still listed' : ' – Zoho said: ' . substr(preg_replace('/\\s+/', ' ', $traw), 0, 200))));
} else $step('Move a file to the WorkDrive trash (used when something is deleted in the app)', false, 'Could not create the second test file.');
$done();
