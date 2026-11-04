<?php
declare(strict_types=1);
/*
 Front door of LatchHub. Signed-out visitors get the login page; signed-in people get the app (index.html).
 Until lh-config.php exists on the server (database not set up yet) the app is served as before so nothing breaks during setup.
*/
require __DIR__ . '/api/_lib.php';
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

function app_html(string $extra = ''): string {
  $h = (string)file_get_contents(__DIR__ . '/index.html');
  return $extra === '' ? $h : preg_replace('#</body>#i', $extra . '</body>', $h, 1);
}
function fail_page(string $msg): void {
  http_response_code(503);
  echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LatchHub</title><body style="font:16px system-ui;max-width:420px;margin:20vh auto;padding:0 16px;text-align:center"><h2>LatchHub</h2><p>' . htmlspecialchars($msg) . '</p>';
  exit;
}

if (cfg_path() === null) { header('X-LatchHub-Gate: off'); echo app_html(); exit; }
if (!db_available()) fail_page('Sign-in is temporarily unavailable. Please try again in a few minutes.');

$user = current_user();
if ($user) {
  if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24));
  $name = htmlspecialchars($user['name'], ENT_QUOTES);
  $admin = $user['role'] === 'admin' ? '<a href="admin.html" style="color:inherit;opacity:.8;margin-right:10px">Admin</a>' : '';
  $bar = '<div id="lh-user" data-csrf="' . htmlspecialchars((string)$_SESSION['csrf'], ENT_QUOTES) . '" data-role="' . htmlspecialchars($user['role'], ENT_QUOTES) . '" style="position:fixed;top:10px;right:12px;z-index:60;font:12px system-ui,sans-serif;background:rgba(20,20,22,.88);color:#f2f2f3;padding:6px 12px;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.25)">' . '<span id="lh-sync" style="opacity:.7;margin-right:8px"></span>' . $name . ' · ' . $admin . '<a href="#" id="lh-out" style="color:inherit">Sign out</a></div>'
    . '<script>document.getElementById("lh-out").onclick=function(e){e.preventDefault();fetch("api/logout.php",{method:"POST",credentials:"same-origin",headers:{"X-LH-CSRF":document.getElementById("lh-user").dataset.csrf}}).finally(function(){location.reload()})}</script>';
  echo app_html($bar);
  exit;
}
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in · LatchHub</title>
<link rel="icon" type="image/svg+xml" href="assets/latchhub/favicon.svg">
<style>
:root{--bg:#0b0b0c;--panel:#141416;--line:#2a2a2e;--ink:#f2f2f3;--mute:#9a9aa2;--bad:#f87171}
@media(prefers-color-scheme:light){:root{--bg:#f4f4f5;--panel:#fff;--line:#dcdce0;--ink:#16161a;--mute:#6b6b74;--bad:#b91c1c}}
*{box-sizing:border-box}html,body{height:100%}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;padding:16px}
.card{width:100%;max-width:340px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:28px 24px 24px}
.logo{display:block;width:56px;height:56px;margin:0 auto 14px;border-radius:50%}
h1{font-size:18px;margin:0 0 2px;text-align:center;letter-spacing:-.01em}.sub{margin:0 0 20px;text-align:center;color:var(--mute);font-size:13px}
label{display:block;font-size:12px;color:var(--mute);margin:12px 0 4px}
input{width:100%;font:inherit;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}input:focus{outline:2px solid var(--ink);outline-offset:1px}
button{width:100%;margin-top:18px;font:inherit;font-weight:600;padding:11px;border:0;border-radius:8px;background:var(--ink);color:var(--bg);cursor:pointer}button[disabled]{opacity:.6;cursor:default}
.err{min-height:20px;margin-top:12px;color:var(--bad);font-size:13px;text-align:center}
</style></head><body>
<main class="card">
  <img class="logo" src="assets/latchhub/favicon.svg" alt="Latch Infinity">
  <h1>LatchHub</h1><p class="sub">Sign in to continue</p>
  <form id="f" autocomplete="on">
    <label for="u">Email</label><input id="u" name="username" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus>
    <label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required>
    <button id="b" type="submit">Sign in</button>
    <div class="err" id="e" role="alert" aria-live="polite"></div>
  </form>
</main>
<script>
document.getElementById('f').addEventListener('submit',async function(ev){
  ev.preventDefault();var b=document.getElementById('b'),e=document.getElementById('e');e.textContent='';b.disabled=true;b.textContent='Signing in…';
  try{
    var r=await fetch('api/login.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('u').value,password:document.getElementById('p').value})});
    var j={};try{j=await r.json()}catch(x){}
    if(r.ok&&j.user){location.reload();return}
    e.textContent=j.error||'Could not sign in. Please try again.';
  }catch(x){e.textContent='Could not reach the server. Check your connection.'}
  b.disabled=false;b.textContent='Sign in';
});
</script></body></html>
