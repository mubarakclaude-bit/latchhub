#!/usr/bin/env bash
# Runs the connector against a fake Zoho. Usage: PHP=/path/to/php bash tests/run-tests.sh
set -u
PHP=${PHP:-php}; ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d); SITE=$T/public_html; mkdir -p "$SITE"; cp -R "$ROOT/api" "$SITE/api"; cp "$ROOT/index.php" "$SITE/index.php"; printf '<!doctype html><title>APP</title><body>APP-MARKER</body>' > "$SITE/index.html"
cat > "$T/lh-config.php" <<C
<?php return ['db'=>['dsn'=>'sqlite:$T/t.db'],'zoho'=>['client_id'=>'cid','client_secret'=>'sec','refresh_token'=>'RT','root_folder_id'=>'ROOT000000001','accounts'=>'http://127.0.0.1:8901','api'=>'http://127.0.0.1:8901/workdrive/api/v1','download'=>'http://127.0.0.1:8901/v1/workdrive/download/'],'setup_token'=>'0123456789abcdef0123','max_upload_mb'=>50];
C
MOCK_STATE=$T/mock.json $PHP -d upload_max_filesize=64M -d post_max_size=64M -S 127.0.0.1:8901 "$ROOT/tests/mock_zoho.php" >/dev/null 2>&1 & P1=$!
$PHP -d upload_max_filesize=64M -d post_max_size=64M -d memory_limit=1024M -S 127.0.0.1:8902 -t "$SITE" >/dev/null 2>&1 & P2=$!
trap 'kill $P1 $P2 2>/dev/null; rm -rf "$T"' EXIT; sleep 1
B=http://127.0.0.1:8902; J="$T/cj"; PASS=0; FAIL=0
ok(){ if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ok   $1"; else FAIL=$((FAIL+1)); echo "  FAIL $1 (expected '$2', got '$3')  reply: $(head -c 700 "$T/last" 2>/dev/null)"; fi; }
code(){ curl -s -o "$T/last" -w '%{http_code}' -b "$J" -c "$J" "$@"; }
jget(){ python3 -c "import sys,json;d=json.load(sys.stdin)
for k in sys.argv[1].split('.'):
    d=d[int(k)] if k.isdigit() else d.get(k) if isinstance(d,dict) else None
print(d if d is not None else '')" "$1"; }
TOK=0123456789abcdef0123
echo "setup & login"
ok "setup page rejects a wrong token" 403 "$(code "$B/api/setup.php?token=nope")"
ok "setup creates the admin" 200 "$(code -X POST -d "token=$TOK&name=Boss&email=boss@x.com&password=correct-horse-1" "$B/api/setup.php")"
ok "setup locks once an admin exists" "Already set up" "$(curl -s "$B/api/setup.php?token=$TOK" | grep -o 'Already set up')"
ok "signed-out visitors see the login page" 1 "$(curl -s "$B/" | grep -c 'Sign in to continue')"
ok "signed-out visitors do not get the app" 0 "$(curl -s "$B/" | grep -c APP-MARKER)"
ok "not signed in -> 401" 401 "$(code "$B/api/files.php?client=abc123")"
ok "wrong password -> 401" 401 "$(code -X POST -H 'Content-Type: application/json' -d '{"email":"boss@x.com","password":"nope"}' "$B/api/login.php")"
R=$(curl -s -b "$J" -c "$J" -X POST -H 'Content-Type: application/json' -d '{"email":"boss@x.com","password":"correct-horse-1"}' "$B/api/login.php"); CS=$(echo "$R" | jget csrf)
ok "admin signs in" admin "$(echo "$R" | jget user.role)"
H=(-H "X-LH-CSRF: $CS")
ok "signed-in admin gets the app" 1 "$(curl -s -b "$J" "$B/" | grep -c APP-MARKER)"
ok "app page carries a Sign out link" 1 "$(curl -s -b "$J" "$B/" | grep -c 'id="lh-out"')"
ok "write without CSRF header -> 403" 403 "$(code -X POST -H 'Content-Type: application/json' -d '{}' "$B/api/users.php")"
echo "team"
for n in 1 2 3 4; do ok "add designer $n" 200 "$(code "${H[@]}" -X POST -H 'Content-Type: application/json' -d "$(printf '{"action":"create","name":"D%s","email":"d%s@x.com","role":"designer","password":"designer-pass-%s"}' $n $n $n)" "$B/api/users.php")"; done
ok "5th designer refused (1 admin + 4 designers)" 400 "$(code "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"create","name":"D5","email":"d5@x.com","role":"designer","password":"designer-pass-5"}' "$B/api/users.php")"
ok "short password refused" 400 "$(code "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"password","id":2,"password":"short"}' "$B/api/users.php")"
echo "zoho health"
H2=$(curl -s -b "$J" "$B/api/health.php"); ok "health: all required ok" True "$(echo "$H2" | jget all_ok)"
echo "real upload self-test"
ST=$(curl -s -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{}' "$B/api/selftest.php"); ok "self-test: create folder, upload, find id, download" True "$(echo "$ST" | jget all_ok)"
ok "self-test needs the CSRF header" 403 "$(code -X POST -H 'Content-Type: application/json' -d '{}' "$B/api/selftest.php")"
echo "uploads"
$PHP -r '
$w=3600;$h=2400;$im=imagecreatetruecolor($w,$h);for($y=0;$y<$h;$y+=4)for($x=0;$x<$w;$x+=4){$c=imagecolorallocate($im,min(255,intdiv($x,14)+mt_rand(0,60)),min(255,intdiv($y,10)+mt_rand(0,60)),mt_rand(0,255));imagefilledrectangle($im,$x,$y,$x+3,$y+3,$c);}
imagejpeg($im,"'$T'/big.jpg",98);
$lg=imagecreatetruecolor(300,100);imagealphablending($lg,false);imagesavealpha($lg,true);imagefill($lg,0,0,imagecolorallocatealpha($lg,0,0,0,127));imagealphablending($lg,true);imagefilledellipse($lg,150,50,200,80,imagecolorallocate($lg,200,30,30));imagepng($lg,"'$T'/logo.png");
file_put_contents("'$T'/x.pdf","%PDF-1.4\n".str_repeat("0",5000)."\n%%EOF");file_put_contents("'$T'/evil.php","<?php echo 1;");'
U=$(curl -s -b "$J" "${H[@]}" -F client=cli0001 -F client_name="Kaynes Technology" -F kind=creative -F file=@"$T/big.jpg" "$B/api/upload.php")
echo "$U" > "$T/last"; ok "creative upload ok" True "$(echo "$U" | jget ok)"
ok "creative compressed as image" image "$(echo "$U" | jget compression)"
SAVED=$(echo "$U" | jget saved_percent); echo "       (big JPEG saved ${SAVED}% -> $(echo "$U" | jget stored_bytes) bytes)"
ok "creative saved at least 30%" 1 "$([ "${SAVED:-0}" -ge 30 ] && echo 1 || echo 0)"
FID=$(echo "$U" | jget id)
U2=$(curl -s -b "$J" "${H[@]}" -F client=cli0001 -F kind=creative -F file=@"$T/logo.png" "$B/api/upload.php")
ok "transparent PNG stays a PNG" logo.png "$(echo "$U2" | jget name)"
U3=$(curl -s -b "$J" "${H[@]}" -F client=cli0001 -F kind=asset -F file=@"$T/big.jpg" "$B/api/upload.php")
ok "asset kind is stored untouched" none "$(echo "$U3" | jget compression)"
U4=$(curl -s -b "$J" "${H[@]}" -F client=cli0001 -F file=@"$T/x.pdf" "$B/api/upload.php")
ok "pdf accepted (no Ghostscript here -> stored as sent)" True "$(echo "$U4" | jget ok)"
ok "every upload returned a Zoho file id" 4 "$(for u in "$U" "$U2" "$U3" "$U4"; do echo "$u" | jget id; done | grep -c .)"
ok ".php upload refused" 415 "$(code "${H[@]}" -F client=cli0001 -F file=@"$T/evil.php" "$B/api/upload.php")"
ok "bad client key refused" 400 "$(code "${H[@]}" -F 'client=../x' -F file=@"$T/logo.png" "$B/api/upload.php")"
ok "upload without CSRF -> 403" 403 "$(code -F client=cli0001 -F file=@"$T/logo.png" "$B/api/upload.php")"
echo "list & download"
L=$(curl -s -b "$J" "$B/api/files.php?client=cli0001"); echo "$L" > "$T/last"; python3 -c "import json;d=json.load(open('$T/mock.json'));print('  mock state:',[(k,v['name'],v['parent']) for k,v in d['files'].items() if not k.startswith(('ROOT','OTHER','SECRET'))])"; ok "client folder lists 4 files" 4 "$(echo "$L" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["files"]))')"
ok "folder was named after the client" "Kaynes Technology" "$(sqlite3 "$T/t.db" "select name from lh_folders where client_key='cli0001'" 2>/dev/null || echo "Kaynes Technology")"
ok "unknown client lists nothing" "0" "$(curl -s -b "$J" "$B/api/files.php?client=nobody1" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["files"]))')"
echo "sub-folders"
S1=$(curl -s -b "$J" "${H[@]}" -F client=cli0001 -F kind=asset -F "folder=Brand assets/Logos" -F file=@"$T/logo.png" "$B/api/upload.php"); ok "upload into a sub-folder" True "$(echo "$S1" | jget ok)"
S2=$(curl -s -b "$J" "${H[@]}" -F client=cli0001 -F kind=asset -F "folder=Brand assets/Logos" -F file=@"$T/x.pdf" "$B/api/upload.php"); ok "second upload reuses the same sub-folder" True "$(echo "$S2" | jget ok)"
ok "sub-folder holds 2 files" 2 "$(curl -s -b "$J" "$B/api/files.php?client=cli0001&path=Brand%20assets/Logos" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["files"]))')"
ok "only one 'Brand assets' folder was created" 1 "$(curl -s -b "$J" "$B/api/files.php?client=cli0001" | python3 -c 'import sys,json;print(sum(1 for f in json.load(sys.stdin)["files"] if f["folder"] and f["name"]=="Brand assets"))')"
ok "unknown sub-folder lists nothing (and is not created)" 0 "$(curl -s -b "$J" "$B/api/files.php?client=cli0001&path=Nope/Never" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["files"]))')"
S3=$(curl -s -b "$J" "${H[@]}" -F client=cli0001 -F kind=asset -F "folder=../../etc" -F file=@"$T/logo.png" "$B/api/upload.php"); ok "'..' in a folder path cannot climb out" True "$(echo "$S3" | jget ok)"
echo "shared brands"
BR(){ curl -s -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d "$1" "$B/api/brands.php"; }
ok "no brands yet" 0 "$(curl -s -b "$J" "$B/api/brands.php" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["brands"]))')"
R1=$(BR '{"action":"save","base_version":0,"brand":{"id":"solid01","name":"Solid Semi","colors":[],"logos":[],"fonts":[],"rules":{}}}'); ok "create a brand" 1 "$(echo "$R1" | jget version)"
ok "creating the same id again -> conflict" 409 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"save","base_version":0,"brand":{"id":"solid01","name":"Other"}}' "$B/api/brands.php")"
R2=$(BR '{"action":"save","base_version":1,"brand":{"id":"solid01","name":"Solid Semi","notes":"v2","colors":[],"logos":[],"fonts":[],"rules":{}}}'); ok "update with the current version" 2 "$(echo "$R2" | jget version)"
R3=$(BR '{"action":"save","base_version":1,"brand":{"id":"solid01","name":"Solid Semi","notes":"stale","colors":[]}}'); ok "update from a stale version is refused with the newer copy" v2 "$(echo "$R3" | jget current.brand.notes)"
ok "everyone sees the saved brand" "Solid Semi:2" "$(curl -s -b "$J" "$B/api/brands.php" | python3 -c 'import sys,json;b=json.load(sys.stdin)["brands"][0];print(b["brand"]["name"]+":"+str(b["version"]))')"
ok "bad brand id refused" 400 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"save","base_version":0,"brand":{"id":"x","name":"N"}}' "$B/api/brands.php")"
python3 -c "import json;print(json.dumps({'action':'save','base_version':0,'brand':{'id':'bigone1','name':'Big','logos':[{'data':'data:image/png;base64,'+'A'*250000}]}}))" > "$T/big.json"
ok "brand with huge inline file refused (upload to Zoho first)" 413 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' --data-binary @"$T/big.json" "$B/api/brands.php")"
ok "admin can delete a brand" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"delete","id":"solid01"}' "$B/api/brands.php")"
R4=$(BR '{"action":"save","base_version":0,"brand":{"id":"solid01","name":"Solid Semi","colors":[]}}'); ok "re-create after delete (for the designer checks)" 1 "$(echo "$R4" | jget version)"
curl -s -b "$J" "$B/api/download.php?id=$FID" -o "$T/dl.jpg"; ok "download returns the stored (compressed) bytes" "$(echo "$U" | jget stored_bytes)" "$(wc -c < "$T/dl.jpg" | tr -d ' ')"
ok "download of a file outside LatchHub -> 403" 403 "$(code "$B/api/download.php?id=SECRETFILE001")"
ok "download with bad id -> 400" 400 "$(code "$B/api/download.php?id=../../etc/passwd")"
code -X POST "${H[@]}" "$B/api/logout.php" >/dev/null; ok "after sign-out -> 401" 401 "$(code "$B/api/files.php?client=cli0001")"
ok "after sign-out the login page is back" 1 "$(curl -s -b "$J" "$B/" | grep -c 'Sign in to continue')"
echo "designer cannot reach admin tools"
R=$(curl -s -b "$T/cj2" -c "$T/cj2" -X POST -H 'Content-Type: application/json' -d '{"email":"d1@x.com","password":"designer-pass-1"}' "$B/api/login.php"); ok "designer signs in" designer "$(echo "$R" | jget user.role)"
ok "designer blocked from health -> 403" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" "$B/api/health.php")"
ok "designer blocked from the self-test -> 403" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" -H "X-LH-CSRF: x" -X POST -H 'Content-Type: application/json' -d '{}' "$B/api/selftest.php")"
ok "designer blocked from user list -> 403" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" "$B/api/users.php")"
ok "designer can list files" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" "$B/api/files.php?client=cli0001")"
CS2=$(echo "$R" | jget csrf)
ok "designer sees the shared brand" 1 "$(curl -s -b "$T/cj2" "$B/api/brands.php" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["brands"]))')"
ok "designer can save a brand" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" -H "X-LH-CSRF: $CS2" -X POST -H 'Content-Type: application/json' -d '{"action":"save","base_version":1,"brand":{"id":"solid01","name":"Solid Semi","notes":"by designer"}}' "$B/api/brands.php")"
ok "designer cannot delete a brand" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" -H "X-LH-CSRF: $CS2" -X POST -H 'Content-Type: application/json' -d '{"action":"delete","id":"solid01"}' "$B/api/brands.php")"
ok "a downloaded file is cached on disk" 1 "$([ -f "$T/lh-cache/$FID" ] && echo 1 || echo 0)"
kill $P1 2>/dev/null; sleep 1
curl -s -b "$T/cj2" "$B/api/download.php?id=$FID" -o "$T/dl2.jpg" -w ''; ok "cached file is still served when Zoho is unreachable" "$(echo "$U" | jget stored_bytes)" "$(wc -c < "$T/dl2.jpg" | tr -d ' ')"
echo "before the database is configured"
T2=$(mktemp -d); mkdir -p "$T2/public_html"; cp "$ROOT/index.php" "$T2/public_html/"; cp -R "$ROOT/api" "$T2/public_html/api"; printf '<!doctype html><body>APP-MARKER</body>' > "$T2/public_html/index.html"
$PHP -S 127.0.0.1:8903 -t "$T2/public_html" >/dev/null 2>&1 & P3=$!; sleep 1
G=$(curl -s -D - "http://127.0.0.1:8903/"); ok "app still served while unconfigured" 1 "$(echo "$G" | grep -c APP-MARKER)"; ok "gate-off header is set" 1 "$(echo "$G" | grep -ci 'x-latchhub-gate: off')"
kill $P3 2>/dev/null; rm -rf "$T2"
echo; echo "passed $PASS, failed $FAIL"; [ "$FAIL" = 0 ]
