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
  $bar = '<div id="lh-user" data-csrf="' . htmlspecialchars((string)$_SESSION['csrf'], ENT_QUOTES) . '" data-role="' . htmlspecialchars($user['role'], ENT_QUOTES) . '" style="position:fixed;top:10px;right:12px;z-index:60;font:12px system-ui,sans-serif;background:rgba(20,20,22,.88);color:#f2f2f3;padding:6px 12px;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.25)">' . '<span id="lh-sync" style="opacity:.7;margin-right:8px"></span><span id="lh-name">' . $name . '</span> · ' . $admin . '<a href="#" id="lh-out" style="color:inherit">Sign out</a></div>'
    . '<script>document.getElementById("lh-out").onclick=function(e){e.preventDefault();fetch("api/logout.php",{method:"POST",credentials:"same-origin",headers:{"X-LH-CSRF":document.getElementById("lh-user").dataset.csrf}}).finally(function(){location.reload()})}</script>';
  echo app_html($bar);
  exit;
}
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in · LatchHub</title>
<link rel="icon" type="image/svg+xml" href="assets/latchhub/favicon.svg">
<style>
:root{--bg:#101010;--ink:#fff;--mute:#9a9a96;--line:#444;--red:#ff4b2b;--bad:#ff8a73}
*{box-sizing:border-box;margin:0;border-radius:0}html,body{height:100%}
body{background:var(--bg);color:var(--ink);font:15px/1.5 "Helvetica Neue",Helvetica,Arial,sans-serif;display:grid;grid-template-columns:1.1fr 1fr;-webkit-font-smoothing:antialiased}
.art{background:var(--red);position:relative;overflow:hidden;padding:36px;color:#fff}
.art .cap{font-size:11px;letter-spacing:.1em;text-transform:uppercase}
.art h1{position:absolute;left:30px;bottom:-3vw;font-size:17vw;font-weight:500;letter-spacing:-.06em;line-height:1}
.card{display:flex;flex-direction:column;justify-content:center;padding:0 min(8vw,110px)}
.cap2{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute)}
h2{font-size:clamp(36px,4vw,56px);font-weight:500;letter-spacing:-.035em;text-transform:uppercase;line-height:.95;margin:10px 0 36px}
label{display:block;margin-top:22px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute)}
input{display:block;width:100%;font:inherit;font-size:16px;padding:10px 0;border:0;border-bottom:1px solid var(--line);background:none;color:var(--ink);letter-spacing:0;text-transform:none}input:focus{outline:0;border-color:var(--red)}
button{width:100%;margin-top:40px;font:inherit;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:16px 20px;border:0;background:#fff;color:#000;cursor:pointer;display:flex;justify-content:space-between}button:hover{background:var(--red);color:#fff}button[disabled]{opacity:.6;cursor:default}
.err{min-height:20px;margin-top:14px;color:var(--bad);font-size:13px}
@media(max-width:800px){body{grid-template-columns:1fr;grid-template-rows:26vh 1fr;height:auto;min-height:100%}.art h1{font-size:24vw}.card{padding:36px 24px}}
</style></head><body>
<div class="art"><span class="cap">Latch Infinity — Brand asset hub</span><h1>LatchHub</h1></div>
<main class="card">
  <span class="cap2">Sign in to continue</span><h2>Welcome<br>back</h2>
  <form id="f" autocomplete="on">
    <label for="u">Email</label><input id="u" name="username" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus>
    <label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required>
    <button id="b" type="submit"><span>Sign in</span><span>→</span></button>
    <div class="err" id="e" role="alert" aria-live="polite"></div>
  </form>
</main>
<script>
document.getElementById('f').addEventListener('submit',async function(ev){
  ev.preventDefault();var b=document.getElementById('b'),e=document.getElementById('e');e.textContent='';b.disabled=true;b.firstChild.textContent='Signing in…';
  try{
    var r=await fetch('api/login.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('u').value,password:document.getElementById('p').value})});
    var j={};try{j=await r.json()}catch(x){}
    if(r.ok&&j.user){location.reload();return}
    e.textContent=j.error||'Could not sign in. Please try again.';
  }catch(x){e.textContent='Could not reach the server. Check your connection.'}
  b.disabled=false;b.firstChild.textContent='Sign in';
});
</script></body></html>
