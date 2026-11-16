<?php
declare(strict_types=1);
/*
 Background work that must happen even when nobody has the site open:
   - files that are complete on this server but not yet in Zoho are delivered (with growing pauses after failures)
   - removals that Zoho refused earlier are retried
 Hostinger: hPanel → Advanced → Cron Jobs → every 5 minutes, command:
   php /home/USER/domains/latchinfinity.com/public_html/LatchHub/api/cron.php
 It can also be started by the admin from the browser (POST, signed in).
*/
require __DIR__ . '/_lib.php';
require __DIR__ . '/_fm.php';
if (PHP_SAPI !== 'cli') { require_method('POST'); require_admin(true); session_write_close(); }
@set_time_limit(0); ignore_user_abort(true);
$lock = fopen(fm_spool_base() . '/.cron', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { if (PHP_SAPI === 'cli') exit(0); out(200, ['ok' => true, 'busy' => true]); }
$delivered = fm_pump(50, 240);
$trash = process_pending(20);
$q = db()->query("SELECT COUNT(*) c FROM lh_uploads WHERE state='queued'")->fetch();
db()->prepare('REPLACE INTO lh_kv (k,v,exp) VALUES (?,?,0)')->execute(['cron_last', gmdate('c')]);
$res = ['ok' => true, 'delivered' => $delivered, 'still_waiting' => (int)$q['c'], 'trash_retried' => $trash];
if (PHP_SAPI === 'cli') { echo json_encode($res), "\n"; exit(0); }
out(200, $res);
