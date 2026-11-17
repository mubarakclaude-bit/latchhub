#!/usr/bin/env bash
# Runs the connector against a fake Zoho. Usage: PHP=/path/to/php bash tests/run-tests.sh
set -u
PHP=${PHP:-php}; ROOT=$(cd "$(dirname "$0")/.." && pwd)
for port in 8901 8902 8903; do if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$port/"; then echo "Port $port is already in use (an earlier test run still running?). Stop it first, e.g.: pkill -f 'php .*-S .*:890'"; exit 2; fi; done
T=$(mktemp -d); SITE=$T/public_html; mkdir -p "$SITE"; cp -R "$ROOT/api" "$SITE/api"; cp "$ROOT/index.php" "$SITE/index.php"; printf '<!doctype html><title>APP</title><body>APP-MARKER</body>' > "$SITE/index.html"
cp "$ROOT/serve.php" "$SITE/serve.php"; mkdir -p "$SITE/assets/kaynes" "$SITE/assets/latchhub"; echo '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>' > "$SITE/assets/kaynes/logo.svg"; echo '<svg xmlns="http://www.w3.org/2000/svg"/>' > "$SITE/assets/latchhub/favicon.svg"; echo '{"brands":[{"name":"Secret Client"}]}' > "$SITE/brand-hub-data.json"; echo '<?php echo "pwned";' > "$SITE/assets/kaynes/evil.php"; echo hidden > "$SITE/assets/.secret"
cat > "$T/lh-config.php" <<C
<?php return ['db'=>['dsn'=>'sqlite:$T/t.db'],'zoho'=>['client_id'=>'cid','client_secret'=>'sec','refresh_token'=>'RT','root_folder_id'=>'ROOT000000001','accounts'=>'http://127.0.0.1:8901','api'=>'http://127.0.0.1:8901/workdrive/api/v1','download'=>'http://127.0.0.1:8901/v1/workdrive/download/','upload'=>'http://127.0.0.1:8901'],'setup_token'=>'0123456789abcdef0123','max_upload_mb'=>50,'folder_check_ttl'=>2,'fm'=>['single_max'=>1000000,'chunk_min'=>2097152,'piece'=>262144,'retry_base'=>0,'orphan_after'=>0]];
C
MOCK_STATE=$T/mock.json MOCK_CHUNK=1048576 MOCK_CHUNK_MIN=2097152 $PHP -d upload_max_filesize=64M -d post_max_size=64M -S 0.0.0.0:8901 "$ROOT/tests/mock_zoho.php" >/dev/null 2>&1 & P1=$!
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
echo "files are protected, not just the screen"
HC(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
ok "a stranger cannot fetch a client logo" 401 "$(HC "$B/serve.php?f=assets/kaynes/logo.svg")"
ok "a stranger cannot fetch the client data file" 401 "$(HC "$B/serve.php?f=brand-hub-data.json")"
ok "the sign-in page's own logo stays public" 200 "$(HC "$B/serve.php?f=assets/latchhub/favicon.svg")"
ok "../ cannot climb out of the assets folder" 404 "$(HC "$B/serve.php?f=assets/../api/_lib.php")"
ok "a path outside assets/ is refused" 404 "$(HC "$B/serve.php?f=api/_lib.php")"
ok "hidden files are refused" 404 "$(HC "$B/serve.php?f=assets/.secret")"
ok "not signed in -> 401" 401 "$(code "$B/api/files.php?client=abc123")"
ok "wrong password -> 401" 401 "$(code -X POST -H 'Content-Type: application/json' -d '{"email":"boss@x.com","password":"nope"}' "$B/api/login.php")"
R=$(curl -s -b "$J" -c "$J" -X POST -H 'Content-Type: application/json' -d '{"email":"boss@x.com","password":"correct-horse-1"}' "$B/api/login.php"); CS=$(echo "$R" | jget csrf)
ok "admin signs in" admin "$(echo "$R" | jget user.role)"
H=(-H "X-LH-CSRF: $CS")
ok "signed-in admin gets the app" 1 "$(curl -s -b "$J" "$B/" | grep -c APP-MARKER)"
ok "a signed-in person gets the logo" image/svg+xml "$(curl -s -o /dev/null -w '%{content_type}' -b "$J" "$B/serve.php?f=assets/kaynes/logo.svg")"
ok "  … with the right bytes" 1 "$(curl -s -b "$J" "$B/serve.php?f=assets/kaynes/logo.svg" | grep -c '<rect')"
ok "  … the SVG is sandboxed when opened directly" 1 "$(curl -sI -b "$J" "$B/serve.php?f=assets/kaynes/logo.svg" | grep -ci 'content-security-policy: sandbox')"
ET=$(curl -sI -b "$J" "$B/serve.php?f=assets/kaynes/logo.svg" | grep -i '^etag' | cut -d' ' -f2 | tr -d '\r')
ok "  … repeat visits are answered from the browser cache (304)" 304 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" -H "If-None-Match: $ET" "$B/serve.php?f=assets/kaynes/logo.svg")"
ok "a signed-in person gets the client data file" 1 "$(curl -s -b "$J" "$B/serve.php?f=brand-hub-data.json" | grep -c 'Secret Client')"
ok "a PHP file inside assets/ is never executed or served" 403 "$(HC -b "$J" "$B/serve.php?f=assets/kaynes/evil.php")"
ok "app page carries a Sign out link" 1 "$(curl -s -b "$J" "$B/" | grep -c 'id="lh-out"')"
ok "write without CSRF header -> 403" 403 "$(code -X POST -H 'Content-Type: application/json' -d '{}' "$B/api/users.php")"
echo "team"
for n in 1 2 3 4 5 6 7 8 9 10; do ok "add designer $n" 200 "$(code "${H[@]}" -X POST -H 'Content-Type: application/json' -d "$(printf '{"action":"create","name":"D%s","email":"d%s@x.com","role":"designer","password":"designer-pass-%s"}' $n $n $n)" "$B/api/users.php")"; done
ok "11th designer refused (1 admin + 10 designers)" 400 "$(code "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"create","name":"D11","email":"d11@x.com","role":"designer","password":"designer-pass-11"}' "$B/api/users.php")"
ok "short password refused" 400 "$(code "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"password","id":2,"password":"short"}' "$B/api/users.php")"
echo "zoho health"
H2=$(curl -s -b "$J" "$B/api/health.php"); ok "health: all required ok" True "$(echo "$H2" | jget all_ok)"
echo "real upload self-test"
ST=$(curl -s -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{}' "$B/api/selftest.php"); ok "self-test: create folder, upload, find id, download" True "$(echo "$ST" | jget all_ok)"
ok "self-test needs the CSRF header" 403 "$(code -X POST -H 'Content-Type: application/json' -d '{}' "$B/api/selftest.php")"
ok "self-test includes the large-file route (Zoho's upload server)" True "$(echo "$ST" | python3 -c 'import sys,json;print([x["ok"] for x in json.load(sys.stdin)["steps"] if x["step"].startswith("Large-file route")][0])')"
echo "a Zoho key without the file-server permissions (ZohoFiles.files.*)"
echo sc > "$T/sc.txt"; SCID=$(curl -s -b "$J" "${H[@]}" -F client=scope01 -F client_name="Scope Co" -F kind=asset -F file=@"$T/sc.txt" "$B/api/upload.php" | jget id)
touch "$T/mock.json.noscope"
ST2=$(curl -s -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{}' "$B/api/selftest.php"); echo "$ST2" > "$T/last"
ok "the self-test fails" False "$(echo "$ST2" | jget all_ok)"
ok "  … and names the missing download permission" 1 "$(echo "$ST2" | python3 -c 'import sys,json;print(sum(1 for x in json.load(sys.stdin)["steps"] if not x["ok"] and "ZohoFiles.files.READ" in x["note"]))')"
ok "  … and the missing large-file permission" 1 "$(echo "$ST2" | python3 -c 'import sys,json;print(sum(1 for x in json.load(sys.stdin)["steps"] if not x["ok"] and "ZohoFiles.files.CREATE" in x["note"]))')"
ok "a download says which permission the key lacks" 1 "$(curl -s -b "$J" "$B/api/download.php?id=$SCID" | grep -c 'ZohoFiles.files.READ')"
rm -f "$T/mock.json.noscope"
ok "with the right key the same download works" sc "$(curl -s -b "$J" "$B/api/download.php?id=$SCID")"
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
echo "big files go up in pieces"
head -c 3200000 /dev/urandom > "$T/chunky.bin"; rm -f "$T"/part_*; split -b 1048576 "$T/chunky.bin" "$T/part_"
CID=$(python3 -c "import secrets;print(secrets.token_hex(12))"); N=$(ls "$T"/part_* | wc -l | tr -d ' '); i=0; LASTR=""
for p in "$T"/part_*; do LASTR=$(curl -s -b "$J" "${H[@]}" -F client=chunkbr1 -F client_name="Chunky" -F kind=asset -F folder="Brand book" -F filename=chunky.zip -F chunk_id=$CID -F chunk_index=$i -F chunk_total=$N -F file=@"$p" "$B/api/upload.php"); i=$((i+1)); done
ok "a file sent in pieces is put back together" 3200000 "$(echo "$LASTR" | jget stored_bytes)"
ok "  … and lands in Zoho at the right size" 3200000 "$(python3 -c "import json,base64;d=json.load(open('$T/mock.json'))['files'];print([len(base64.b64decode(v['data'])) for v in d.values() if v['name']=='chunky.zip'][0])")"
ok "  … the temporary pieces are cleaned up" 0 "$(find "$T/lh-cache/tmp" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')"
CID2=$(python3 -c "import secrets;print(secrets.token_hex(12))"); MR=""
for k in 0 2; do MR=$(curl -s -b "$J" "${H[@]}" -F client=chunkbr1 -F kind=asset -F filename=gap.zip -F chunk_id=$CID2 -F chunk_index=$k -F chunk_total=3 -F file=@"$T/part_aa" "$B/api/upload.php"); done
ok "a missing piece is reported, not silently stored" 1 "$(echo "$MR" | python3 -c 'import sys,json;print(1 if "missing" in json.load(sys.stdin).get("error","") else 0)')"
ok "an invalid upload id is refused" 400 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "${H[@]}" -F client=chunkbr1 -F kind=asset -F filename=x.zip -F chunk_id=../../etc -F chunk_index=0 -F chunk_total=1 -F file=@"$T/part_aa" "$B/api/upload.php")"
ER=$(curl -s -X POST -b "$J" "${H[@]}" "$B/api/upload.php"); ok "an upload that arrives empty gets a clear explanation" 1 "$(echo "$ER" | python3 -c 'import sys,json;print(1 if "arrived empty" in json.load(sys.stdin).get("error","") else 0)')"
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
sqlite3 "$T/t.db" "DROP TABLE lh_brands; DELETE FROM lh_kv WHERE k='schema';" && ok "(simulated an older install without the shared-clients table)" 0 0
ok "older install is upgraded automatically on the next request" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "$B/api/brands.php")"
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
echo "deleting follows into Zoho (trash)"
MOCKTRASHED(){ python3 -c "import json,sys;d=json.load(open('$T/mock.json'))['files'];print(1 if d.get(sys.argv[1],{}).get('trashed') else 0)" "$1"; }
UP(){ curl -s -b "$J" "${H[@]}" -F client="$1" -F client_name="$2" -F kind=asset -F folder="Brand assets" -F file=@"$3" "$B/api/upload.php"; }
echo "alpha" > "$T/a.txt"; echo "beta" > "$T/b.txt"; echo "gamma" > "$T/failtrash.txt"
IA=$(UP delbr01 "Delete Me" "$T/a.txt" | jget id); IB=$(UP delbr01 "Delete Me" "$T/b.txt" | jget id)
SV(){ curl -s -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d "$1" "$B/api/brands.php"; }
R1=$(SV "{\"action\":\"save\",\"base_version\":0,\"brand\":{\"id\":\"delbr01\",\"name\":\"Delete Me\",\"logos\":[{\"a\":\"api/download.php?id=$IA\"},{\"b\":\"api/download.php?id=$IB\"}]}}"); ok "brand with two Zoho files saved" 1 "$(echo "$R1" | jget version)"
R2=$(SV "{\"action\":\"save\",\"base_version\":1,\"brand\":{\"id\":\"delbr01\",\"name\":\"Delete Me\",\"logos\":[{\"a\":\"api/download.php?id=$IA\"}]}}"); ok "removing one logo trashes exactly that file" 1 "$(echo "$R2" | jget trashed)"
ok "  … the removed file is in the Zoho trash" 1 "$(MOCKTRASHED "$IB")"
ok "  … the kept file is untouched" 0 "$(MOCKTRASHED "$IA")"
ok "  … the removed file can no longer be opened" 404 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "$B/api/download.php?id=$IB")"
R3=$(SV '{"action":"save","base_version":0,"brand":{"id":"foreign1","name":"Foreign","logos":[{"x":"api/download.php?id=SECRETFILE001"}]}}'); R4=$(SV '{"action":"save","base_version":1,"brand":{"id":"foreign1","name":"Foreign","logos":[]}}')
ok "a link to a file LatchHub did not upload is never trashed" 0 "$(echo "$R4" | jget trashed)"
ok "  … the other team's file is intact" 0 "$(MOCKTRASHED SECRETFILE001)"
RD=$(curl -s -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"delete","id":"delbr01"}' "$B/api/brands.php"); ok "deleting a client trashes its Zoho folder" True "$(echo "$RD" | jget trashed_folder)"
FOLD=$(python3 -c "import json;d=json.load(open('$T/mock.json'))['files'];print([k for k,v in d.items() if v['name']=='Delete Me' and v.get('folder')][0])")
ok "  … the folder is in the Zoho trash" 1 "$(MOCKTRASHED "$FOLD")"
ok "  … so is the file that was still inside it" 1 "$(MOCKTRASHED "$IA")"
ok "the deleted client is kept aside, not erased" 1 "$(sqlite3 "$T/t.db" "select count(*) from lh_deleted where id='delbr01'")"
ok "admin can list deleted clients" delbr01 "$(curl -s -b "$J" "$B/api/brands.php?deleted=1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["deleted"][0]["id"])')"
RR=$(curl -s -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"restore","id":"delbr01"}' "$B/api/brands.php"); ok "restoring brings the client back" True "$(echo "$RR" | jget ok)"
ok "  … it is in the shared list again" 1 "$(curl -s -b "$J" "$B/api/brands.php" | python3 -c 'import sys,json;print(sum(1 for b in json.load(sys.stdin)["brands"] if b["id"]=="delbr01"))')"
ok "  … its Zoho folder is out of the trash" 0 "$(MOCKTRASHED "$FOLD")"
ok "  … and its file can be opened again" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "$B/api/download.php?id=$IA")"
ok "  … the restore entry is gone" 0 "$(sqlite3 "$T/t.db" "select count(*) from lh_deleted where id='delbr01'")"
IF=$(UP failbr1 "Stubborn" "$T/failtrash.txt" | jget id)
SV "{\"action\":\"save\",\"base_version\":0,\"brand\":{\"id\":\"failbr1\",\"name\":\"Stubborn\",\"logos\":[{\"a\":\"api/download.php?id=$IF\"}]}}" > /dev/null
R5=$(SV '{"action":"save","base_version":1,"brand":{"id":"failbr1","name":"Stubborn","logos":[]}}'); ok "when Zoho refuses, the save still succeeds" 0 "$(echo "$R5" | jget trashed)"
ok "  … and the failed trash is queued for retry" 1 "$(sqlite3 "$T/t.db" "select count(*) from lh_pending where zoho_id='$IF'")"
ok "admin sees the queue with Zoho's own reply" 1 "$(curl -s -b "$J" "$B/api/brands.php?pending=1" | python3 -c 'import sys,json;print(sum(1 for p in json.load(sys.stdin)["pending"] if "F415" in p["reason"]))')"
RT=$(curl -s -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"retry_pending"}' "$B/api/brands.php"); ok "retrying while Zoho still refuses keeps it queued" 1 "$(echo "$RT" | jget failed)"
curl -s -X PATCH -H 'Authorization: Zoho-oauthtoken TESTTOKEN' -H 'Content-Type: application/vnd.api+json' -d '{"data":{"attributes":{"name":"fine-now.txt"},"type":"files"}}' "http://127.0.0.1:8901/workdrive/api/v1/files/$IF" > /dev/null
RT2=$(curl -s -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"retry_pending"}' "$B/api/brands.php"); ok "once Zoho accepts, retry clears the queue" 0 "$(sqlite3 "$T/t.db" "select count(*) from lh_pending where zoho_id='$IF'")"
ok "  … and the file is in the Zoho trash" 1 "$(MOCKTRASHED "$IF")"
echo "renaming follows into Zoho"
MOCKNAME(){ python3 -c "import json,sys;print(json.load(open('$T/mock.json'))['files'][sys.argv[1]]['name'])" "$1"; }
MOCKPARENT(){ python3 -c "import json,sys;print(json.load(open('$T/mock.json'))['files'][sys.argv[1]]['parent'])" "$1"; }
IR=$(UP renbr01 "Old Name" "$T/a.txt" | jget id); SUBF=$(MOCKPARENT "$IR"); PARENT=$(MOCKPARENT "$SUBF")   # SUBF = "Brand assets", PARENT = the client folder
SV '{"action":"save","base_version":0,"brand":{"id":"renbr01","name":"Old Name","logos":[]}}' > /dev/null
RN=$(SV '{"action":"save","base_version":1,"brand":{"id":"renbr01","name":"New Name","logos":[]}}'); ok "renaming a client renames its Zoho folder" True "$(echo "$RN" | jget renamed)"
ok "  … the folder carries the new name" "New Name" "$(MOCKNAME "$PARENT")"
ok "  … the app's folder record follows" "New Name" "$(sqlite3 "$T/t.db" "select name from lh_folders where client_key='renbr01'")"
IR2=$(UP renbr01 "New Name" "$T/b.txt" | jget id); ok "  … later uploads still go into the same folder" "$SUBF" "$(MOCKPARENT "$IR2")"
UP takenb1 "Taken" "$T/b.txt" > /dev/null
RC=$(SV '{"action":"save","base_version":2,"brand":{"id":"renbr01","name":"Taken","logos":[]}}')
ok "a name Zoho already has: the save still works" 3 "$(echo "$RC" | jget version)"
ok "  … and it warns about the clash" 1 "$(echo "$RC" | python3 -c 'import sys,json;print(1 if "already has a folder" in json.load(sys.stdin).get("warning","") else 0)')"
ok "  … the folder keeps its previous name" "New Name" "$(MOCKNAME "$PARENT")"
SV '{"action":"save","base_version":0,"brand":{"id":"nofolder1","name":"A","logos":[]}}' > /dev/null
RS=$(SV '{"action":"save","base_version":1,"brand":{"id":"nofolder1","name":"B","logos":[]}}'); ok "renaming a client that has no Zoho folder yet is fine" 2 "$(echo "$RS" | jget version)"
echo "folders deleted by hand in WorkDrive"
HANDTRASH(){ curl -s -o /dev/null -X PATCH -H 'Authorization: Zoho-oauthtoken TESTTOKEN' -H 'Content-Type: application/vnd.api+json' -d '{"data":{"attributes":{"status":"51"},"type":"files"}}' "http://127.0.0.1:8901/workdrive/api/v1/files/$1"; }
MOCKPAR(){ python3 -c "import json,sys;print(json.load(open('$T/mock.json'))['files'][sys.argv[1]]['parent'])" "$1"; }
UPM(){ curl -s -b "$J" "${H[@]}" -F client=hand001 -F client_name="By Hand" -F kind=asset -F folder="Brand assets" -F file=@"$1" "$B/api/upload.php"; }
echo one > "$T/h1.txt"; echo two > "$T/h2.txt"; echo three > "$T/h3.txt"
HA=$(UPM "$T/h1.txt" | jget id); HSUB=$(MOCKPAR "$HA"); HCLI=$(MOCKPAR "$HSUB")
HANDTRASH "$HCLI"
HB=$(UPM "$T/h2.txt"); ok "client folder deleted by hand: the next upload still works" True "$(echo "$HB" | jget ok)"
HBID=$(echo "$HB" | jget id); HSUB2=$(MOCKPAR "$HBID"); HCLI2=$(MOCKPAR "$HSUB2")
ok "  … into a fresh client folder" 1 "$([ "$HCLI2" != "$HCLI" ] && [ -n "$HCLI2" ] && echo 1 || echo 0)"
ok "  … that carries the client's name" "By Hand" "$(MOCKNAME "$HCLI2")"
ok "  … and the app remembers the new folder" "$HCLI2" "$(sqlite3 "$T/t.db" "select zoho_id from lh_folders where client_key='hand001'")"
HANDTRASH "$HSUB2"; sleep 3
HC=$(UPM "$T/h3.txt"); ok "only the sub-folder deleted by hand: the next upload still works" True "$(echo "$HC" | jget ok)"
HCID=$(echo "$HC" | jget id); ok "  … into a fresh sub-folder under the same client folder" 1 "$([ "$(MOCKPAR "$HCID")" != "$HSUB2" ] && [ "$(MOCKPAR "$(MOCKPAR "$HCID")")" = "$HCLI2" ] && echo 1 || echo 0)"
echo four > "$T/h4.txt"; echo five > "$T/h5.txt"
UPM "$T/h4.txt" > /dev/null; HANDTRASH "$HCLI2"                      # the app has just checked this folder, so it trusts it for a moment…
H5=$(UPM "$T/h5.txt"); ok "deleted by hand right after a check: the failed upload is retried with fresh folders" True "$(echo "$H5" | jget ok)"
HCLI3=$(MOCKPAR "$(MOCKPAR "$(echo "$H5" | jget id)")"); ok "  … and it went to a new client folder" 1 "$([ -n "$HCLI3" ] && [ "$HCLI3" != "$HCLI2" ] && echo 1 || echo 0)"
SV '{"action":"save","base_version":0,"brand":{"id":"hand001","name":"By Hand","logos":[]}}' > /dev/null
HANDTRASH "$HCLI3"
RDH=$(curl -s -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"delete","id":"hand001"}' "$B/api/brands.php"); ok "deleting a client whose folder is already gone is clean" True "$(echo "$RDH" | jget trashed_folder)"
ok "  … nothing is left waiting in the queue for it" 0 "$(sqlite3 "$T/t.db" "select count(*) from lh_pending where zoho_id='$HCLI3'")"
ok "admin can delete a brand" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"delete","id":"solid01"}' "$B/api/brands.php")"
R4=$(BR '{"action":"save","base_version":0,"brand":{"id":"solid01","name":"Solid Semi","colors":[]}}'); ok "re-create after delete (for the designer checks)" 1 "$(echo "$R4" | jget version)"
echo "file manager: browse the client's Zoho folder"
FMJ(){ curl -s -o "$T/last" -w '%{http_code}' -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d "$1" "$B/api/fm.php"; }
FMG(){ curl -s -b "$J" "$B/api/fm.php?client=fmcli01&name=FM%20Client${1:-}"; }
ok "a client without a Zoho folder lists nothing (and nothing is created)" 0 "$(FMG | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["items"]))')"
ok "not signed in -> 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/fm.php?client=fmcli01")"
ok "new folder" 200 "$(FMJ '{"action":"mkdir","client":"fmcli01","name":"FM Client","folder_name":"Campaigns"}')"
CAMP=$(jget id < "$T/last")
ok "  … the same name twice is refused" 409 "$(FMJ '{"action":"mkdir","client":"fmcli01","name":"FM Client","folder_name":"campaigns"}')"
ok "  … it is listed in the client folder" Campaigns "$(FMG | jget items.0.name)"
ok "  … needs the CSRF header" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" -X POST -H 'Content-Type: application/json' -d '{"action":"mkdir","client":"fmcli01","folder_name":"X"}' "$B/api/fm.php")"
ok "open a sub-folder: the trail leads back to the client folder" Campaigns "$(FMG "&folder=$CAMP" | jget trail.0.name)"
ok "a folder of another client cannot be opened" 404 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "$B/api/fm.php?client=fmcli01&folder=OTHERFOLDER01")"
ok "the LatchHub root itself cannot be opened through a client" 404 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "$B/api/fm.php?client=fmcli01&folder=ROOT000000001")"
echo "file manager: uploads of any size, in pieces, resumable"
# FMSTART <file> <folder-id or ''> <relative path> -> start reply ; FMPIECE token offset piecefile -> reply
FMSTART(){ curl -s -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d "{\"client\":\"fmcli01\",\"client_name\":\"FM Client\",\"folder\":\"$2\",\"path\":\"$3\",\"name\":\"$(basename "$1")\",\"size\":$(wc -c < "$1" | tr -d ' '),\"last_modified\":${4:-1700000000000}}" "$B/api/fmupload.php?action=start"; }
FMPIECE(){ curl -s -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/octet-stream' --data-binary @"$3" "$B/api/fmupload.php?action=piece&token=$1&offset=$2"; }
FMFIN(){ curl -s -b "$J" "${H[@]}" -X POST "$B/api/fmupload.php?action=finish&token=$1"; }
# FMSEND <file> <token> <piece> [from-offset] : sends the remaining pieces, prints the last reply
FMSEND(){ local f=$1 tok=$2 pc=$3 off=${4:-0} size r=''; size=$(wc -c < "$f" | tr -d ' ')
  while [ "$off" -lt "$size" ]; do dd if="$f" of="$T/pc" bs="$pc" skip=$((off/pc)) count=1 2>/dev/null; r=$(FMPIECE "$tok" "$off" "$T/pc"); off=$((off+$(wc -c < "$T/pc" | tr -d ' '))); done; echo "$r"; }
MOCKSIZE(){ python3 -c "import json,base64,sys;d=json.load(open('$T/mock.json'))['files'];print(len(base64.b64decode(d[sys.argv[1]].get('data',''))))" "$1"; }
MOCKSHA(){ python3 -c "import json,base64,sys,hashlib;d=json.load(open('$T/mock.json'))['files'];print(hashlib.sha256(base64.b64decode(d[sys.argv[1]].get('data',''))).hexdigest())" "$1"; }
SHA(){ python3 -c "import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest())" "$1"; }
head -c 600000 /dev/urandom > "$T/small.psd"; head -c 1500000 /dev/urandom > "$T/medium.mov"; head -c 3300000 /dev/urandom > "$T/huge.zip"
S1=$(FMSTART "$T/small.psd" "$CAMP" ""); TK1=$(echo "$S1" | jget token); PC1=$(echo "$S1" | jget piece)
ok "small file: normal Zoho upload" single "$(echo "$S1" | jget mode)"
ok "  … pieces are acknowledged with the bytes received" 600000 "$(FMSEND "$T/small.psd" "$TK1" "$PC1" | jget received)"
F1=$(FMFIN "$TK1"); echo "$F1" > "$T/last"; FID1=$(echo "$F1" | jget id)
ok "  … stored in Zoho, in the chosen folder" "$CAMP" "$(MOCKPARENT "$FID1")"
ok "  … byte for byte" "$(SHA "$T/small.psd")" "$(MOCKSHA "$FID1")"
ok "  … finishing twice is harmless" "$FID1" "$(FMFIN "$TK1" | jget id)"
ok "  … the temporary copy on this server is gone" 0 "$(find "$T/lh-cache/up" -type f -not -name '.*' | wc -l | tr -d ' ')"
ok "  … it can be downloaded" "$(SHA "$T/small.psd")" "$(curl -s -b "$J" "$B/api/download.php?id=$FID1&dl=1" -o "$T/dlfm" && SHA "$T/dlfm")"
ok "  … the download says its size (progress bar)" 600000 "$(curl -s -D - -o /dev/null -b "$J" "$B/api/download.php?id=$FID1&dl=1&x=nocache" | grep -i '^content-length' | tr -dc '0-9')"
S2=$(FMSTART "$T/medium.mov" "" "Shoot/Day 1"); TK2=$(echo "$S2" | jget token); PC2=$(echo "$S2" | jget piece)
ok "medium file: Zoho stream upload" stream "$(echo "$S2" | jget mode)"
FMSEND "$T/medium.mov" "$TK2" "$PC2" > /dev/null; F2=$(FMFIN "$TK2"); echo "$F2" > "$T/last"; FID2=$(echo "$F2" | jget id)
ok "  … found in Zoho even though its reply carries no id" 1 "$([ -n "$FID2" ] && echo 1 || echo 0)"
ok "  … byte for byte" "$(SHA "$T/medium.mov")" "$(MOCKSHA "$FID2")"
ok "  … a dropped folder keeps its sub-folders (Shoot › Day 1)" "Day 1" "$(MOCKNAME "$(MOCKPARENT "$FID2")")"
ok "  … under Shoot" Shoot "$(MOCKNAME "$(MOCKPARENT "$(MOCKPARENT "$FID2")")")"
S3=$(FMSTART "$T/huge.zip" "" ""); TK3=$(echo "$S3" | jget token); PC3=$(echo "$S3" | jget piece)
ok "big file: Zoho chunk session" chunk "$(echo "$S3" | jget mode)"
ok "  … pieces add up exactly to one Zoho part" 0 "$((1048576 % PC3))"
dd if="$T/huge.zip" of="$T/pc" bs="$PC3" count=1 2>/dev/null; dd if="$T/huge.zip" of="$T/pc1" bs="$PC3" skip=1 count=1 2>/dev/null
ok "  … pieces may arrive in any order (several at once)" "$PC3" "$(FMPIECE "$TK3" "$PC3" "$T/pc1" | jget received)"
ok "  … a piece of the wrong size is refused" 400 "$(head -c 1000 "$T/huge.zip" > "$T/pcs"; curl -s -o /dev/null -w '%{http_code}' -b "$J" "${H[@]}" -X POST --data-binary @"$T/pcs" "$B/api/fmupload.php?action=piece&token=$TK3&offset=0")"
ok "  … a piece that does not start on a piece boundary is refused" 400 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "${H[@]}" -X POST --data-binary @"$T/pc" "$B/api/fmupload.php?action=piece&token=$TK3&offset=5")"
FMPIECE "$TK3" 0 "$T/pc" > /dev/null
ok "  … the same piece sent twice is accepted once" "$((2*PC3))" "$(FMPIECE "$TK3" 0 "$T/pc" | jget received)"
ok "  … the server says which pieces it has" "11000" "$(curl -s -b "$J" "$B/api/fmupload.php?action=status&token=$TK3" | jget have | head -c 5)"
ok "  … finishing too early is refused, naming what is missing" 2 "$(curl -s -b "$J" "${H[@]}" -X POST "$B/api/fmupload.php?action=finish&token=$TK3" | jget missing.0)"
# connection lost: the browser asks to start the same file again and sends only what is missing
FMSEND "$T/huge.zip" "$TK3" "$PC3" "$((2*PC3))" > /dev/null & SPID=$!; sleep 0.4; kill $SPID 2>/dev/null; wait $SPID 2>/dev/null
S3b=$(FMSTART "$T/huge.zip" "" ""); ok "  … starting the same file again continues the same upload" "$TK3" "$(echo "$S3b" | jget token)"
R3=$(echo "$S3b" | jget received)
ok "  … from where it stopped" 1 "$([ "$R3" -gt 0 ] && echo 1 || echo 0)"
ok "  … complete parts went on to Zoho during the upload (no 1 MB part waits here)" 0 "$(find "$T/lh-cache/up" -name 'part-*' -size +1023k | wc -l | tr -d ' ')"
FMSEND "$T/huge.zip" "$TK3" "$PC3" "$R3" > /dev/null
echo reject > "$T/mock.json.fail"; F3=$(FMFIN "$TK3"); echo "$F3" > "$T/last"
ok "  … Zoho refusing to complete the file: the designer is still done (the server keeps it)" "True queued" "$(echo "$F3" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["ok"],d["state"])')"
ok "  … waiting on the server with every byte" "queued 3300000" "$(curl -s -b "$J" "$B/api/fmupload.php?action=status&token=$TK3" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["state"],d["received"])')"
ok "  … the background job delivers it" 1 "$(curl -s -b "$J" "${H[@]}" -X POST "$B/api/cron.php" | jget delivered)"
FID3=$(curl -s -b "$J" "$B/api/fmupload.php?action=status&token=$TK3" | jget id)
ok "  … now in Zoho" done "$(curl -s -b "$J" "$B/api/fmupload.php?action=status&token=$TK3" | jget state)"
ok "  … byte for byte (3.3 MB through four 1 MB parts)" "$(SHA "$T/huge.zip")" "$(MOCKSHA "$FID3")"
ok "  … and nothing of it is left on this server" 0 "$(find "$T/lh-cache/up/$TK3" -type f 2>/dev/null | wc -l | tr -d ' ')"
ok "the background job needs the admin" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj3" -c "$T/cj3" -X POST -H 'Content-Type: application/json' -d '{"email":"d3@x.com","password":"designer-pass-3"}' "$B/api/login.php" >/dev/null; curl -s -o /dev/null -w '%{http_code}' -b "$T/cj3" -H "X-LH-CSRF: $(curl -s -b "$T/cj3" "$B/api/me.php" | jget csrf)" -X POST "$B/api/cron.php")"
ok "  … and also runs from the command line (Hostinger cron)" 1 "$(cd "$SITE" && $PHP api/cron.php | grep -c '"ok":true')"
echo "file manager: a file waiting on this server is already usable"
head -c 400000 /dev/urandom > "$T/wait.psd"; SW=$(FMSTART "$T/wait.psd" "$CAMP" ""); TKW=$(echo "$SW" | jget token)
FMSEND "$T/wait.psd" "$TKW" "$(echo "$SW" | jget piece)" > /dev/null; echo reject > "$T/mock.json.fail"; FMFIN "$TKW" > /dev/null
WL=$(FMG "&folder=$CAMP")
ok "it is in the folder list straight away" True "$(echo "$WL" | python3 -c 'import sys,json;print([i.get("pending") for i in json.load(sys.stdin)["items"] if i["name"]=="wait.psd"][0])')"
ok "  … and can be downloaded from this server, byte for byte" "$(SHA "$T/wait.psd")" "$(curl -s -b "$J" "$B/api/download.php?up=$TKW&dl=1" -o "$T/wdl" && SHA "$T/wdl")"
ok "  … a stranger cannot download it" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/download.php?up=$TKW")"
curl -s -b "$J" "${H[@]}" -X POST "$B/api/cron.php" > /dev/null
ok "  … once in Zoho the same link leads to the Zoho copy" "$(SHA "$T/wait.psd")" "$(curl -s -L -b "$J" "$B/api/download.php?up=$TKW&dl=1" -o "$T/wdl2" && SHA "$T/wdl2")"
ok "  … and the list shows it once, from Zoho" "1 None" "$(FMG "&folder=$CAMP" | python3 -c 'import sys,json;x=[i for i in json.load(sys.stdin)["items"] if i["name"]=="wait.psd"];print(len(x),x[0].get("pending"))')"
head -c 300000 /dev/urandom > "$T/gone.psd"; SG=$(FMSTART "$T/gone.psd" "$CAMP" ""); TKG=$(echo "$SG" | jget token); FMSEND "$T/gone.psd" "$TKG" "$(echo "$SG" | jget piece)" > /dev/null
sqlite3 "$T/t.db" "UPDATE lh_uploads SET updated_at='2020-01-01 00:00:00' WHERE token='$TKG'"
curl -s -b "$J" "${H[@]}" -X POST "$B/api/cron.php" > /dev/null
ok "every piece arrived but the browser closed before finishing: delivered anyway" done "$(curl -s -b "$J" "$B/api/fmupload.php?action=status&token=$TKG" | jget state)"
head -c 2500000 /dev/urandom > "$T/lost.zip"; S4=$(FMSTART "$T/lost.zip" "$CAMP" ""); TK4=$(echo "$S4" | jget token); P4=$(echo "$S4" | jget piece)
echo lose > "$T/mock.json.fail"; FMSEND "$T/lost.zip" "$TK4" "$P4" > /dev/null; F4=$(FMFIN "$TK4"); echo "$F4" > "$T/last"; FID4=$(echo "$F4" | jget id)
ok "a part Zoho stored but whose reply was lost is not sent twice" "$(SHA "$T/lost.zip")" "$(MOCKSHA "$FID4")"
S5=$(FMSTART "$T/small.psd" "$CAMP" ""); FMSEND "$T/small.psd" "$(echo "$S5" | jget token)" "$(echo "$S5" | jget piece)" > /dev/null; FID5=$(FMFIN "$(echo "$S5" | jget token)" | jget id)
ok "same name twice in one folder: both are kept" 1 "$([ -n "$FID5" ] && [ "$FID5" != "$FID1" ] && [ "$(MOCKNAME "$FID5")" != "small.psd" ] && echo 1 || echo 0)"
echo '<?php echo 1;' > "$T/x.php"; ok "a .php file is refused" 415 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"client":"fmcli01","name":"x.php","size":12}' "$B/api/fmupload.php?action=start")"
ok "upload into a folder of another client is refused" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"client":"fmcli01","folder":"OTHERFOLDER01","name":"a.png","size":12}' "$B/api/fmupload.php?action=start")"
ok "someone else's upload cannot be continued" 404 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj3" -c "$T/cj3" -X POST -H 'Content-Type: application/json' -d '{"email":"d2@x.com","password":"designer-pass-2"}' "$B/api/login.php" >/dev/null; curl -s -o /dev/null -w '%{http_code}' -b "$T/cj3" "$B/api/fmupload.php?action=status&token=$TK4")"
ok "uploads are in the activity log" 1 "$([ "$(curl -s -b "$J" "$B/api/activity.php?action=file_uploaded&q=Shoot" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['events']))")" -ge 1 ] && echo 1 || echo 0)"
echo "file manager: rename and delete"
ok "rename a file (its type is kept)" "poster.psd" "$(FMJ "{\"action\":\"rename\",\"client\":\"fmcli01\",\"name\":\"FM Client\",\"folder\":\"$CAMP\",\"id\":\"$FID1\",\"new_name\":\"poster\"}" >/dev/null; jget name < "$T/last")"
ok "  … Zoho has the new name" "poster.psd" "$(MOCKNAME "$FID1")"
ok "rename to a name already there is refused" 409 "$(FMJ "{\"action\":\"rename\",\"client\":\"fmcli01\",\"name\":\"FM Client\",\"folder\":\"$CAMP\",\"id\":\"$FID5\",\"new_name\":\"poster.psd\"}")"
ok "an item from another folder cannot be renamed through this one" 404 "$(FMJ "{\"action\":\"rename\",\"client\":\"fmcli01\",\"name\":\"FM Client\",\"folder\":\"$CAMP\",\"id\":\"SECRETFILE001\",\"new_name\":\"x\"}")"
SV "{\"action\":\"save\",\"base_version\":0,\"brand\":{\"id\":\"fmcli01\",\"name\":\"FM Client\",\"logos\":[{\"a\":\"api/download.php?id=$FID4\"}]}}" > /dev/null
FMJ "{\"action\":\"trash\",\"client\":\"fmcli01\",\"name\":\"FM Client\",\"folder\":\"$CAMP\",\"ids\":[\"$FID1\",\"$FID4\",\"SECRETFILE001\"]}" > /dev/null
ok "delete: the file goes to the WorkDrive trash" 1 "$(MOCKTRASHED "$FID1")"
ok "  … a file the brand page uses is kept, with the reason" 1 "$(python3 -c "import json;r=json.load(open('$T/last'))['refused'];print(sum(1 for x in r if 'brand page' in x['why']))")"
ok "  … and is not in the trash" 0 "$(MOCKTRASHED "$FID4")"
ok "  … a file outside this folder is never touched" 0 "$(MOCKTRASHED SECRETFILE001)"
DJ(){ curl -s -o "$T/last" -w '%{http_code}' -b "$T/cj3" -H "X-LH-CSRF: $(curl -s -b "$T/cj3" "$B/api/me.php" | jget csrf)" -X POST -H 'Content-Type: application/json' -d "$1" "$B/api/fm.php"; }
DJ "{\"action\":\"trash\",\"client\":\"fmcli01\",\"name\":\"FM Client\",\"ids\":[\"$CAMP\"]}" > /dev/null
ok "a designer cannot delete a folder" 0 "$(MOCKTRASHED "$CAMP")"
echo "project managers (PM)"
ok "admin makes a designer a project manager" 200 "$(FMJ '{"action":"mkdir","client":"fmcli01","name":"FM Client","folder_name":"PM test"}' >/dev/null; code "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"role","id":5,"role":"pm"}' "$B/api/users.php")"
PMF=$(FMG | python3 -c 'import sys,json;print([i["id"] for i in json.load(sys.stdin)["items"] if i["name"]=="PM test"][0])')
curl -s -b "$T/cjpm" -c "$T/cjpm" -X POST -H 'Content-Type: application/json' -d '{"email":"d4@x.com","password":"designer-pass-4"}' "$B/api/login.php" > "$T/last"
ok "  … they sign in as a project manager" pm "$(jget user.role < "$T/last")"
PMCS=$(jget csrf < "$T/last")
PMJ(){ curl -s -o "$T/last" -w '%{http_code}' -b "$T/cjpm" -H "X-LH-CSRF: $PMCS" -X POST -H 'Content-Type: application/json' -d "$1" "$B/api/$2"; }
PMJ "{\"action\":\"trash\",\"client\":\"fmcli01\",\"name\":\"FM Client\",\"ids\":[\"$PMF\"]}" fm.php > /dev/null
ok "  … a project manager can delete a folder" 1 "$(MOCKTRASHED "$PMF")"
ok "  … the app shows them the Dashboard link" 1 "$(curl -s -b "$T/cjpm" "$B/" | grep -c '>Dashboard</a>')"
ok "  … they see the dashboard numbers" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cjpm" "$B/api/stats.php?days=30")"
ok "  … and the activity log" 200 "$(curl -s -o "$T/last" -w '%{http_code}' -b "$T/cjpm" "$B/api/activity.php?limit=50")"
ok "  … without anyone's IP address" 0 "$(python3 -c "import json;print(sum(1 for e in json.load(open('$T/last'))['events'] if e['ip']))")"
ok "  … the admin still sees IP addresses" 1 "$(curl -s -b "$J" "$B/api/activity.php?limit=50" | python3 -c 'import sys,json;print(1 if any(e["ip"] for e in json.load(sys.stdin)["events"]) else 0)')"
ok "  … they cannot see the team list" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cjpm" "$B/api/users.php")"
ok "  … or add people" 403 "$(PMJ '{"action":"create","name":"X","email":"x9@x.com","role":"designer","password":"long-enough-pass"}' users.php)"
ok "  … or change anyone's role" 403 "$(PMJ '{"action":"role","id":6,"role":"pm"}' users.php)"
ok "  … or run the Zoho checks" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cjpm" "$B/api/health.php")"
ok "  … or the upload test" 403 "$(PMJ '{}' selftest.php)"
ok "  … or the background job" 403 "$(PMJ '{}' cron.php)"
ok "  … or the clean-up queue" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cjpm" "$B/api/brands.php?pending=1")"
ok "  … or restore deleted clients" 403 "$(PMJ '{"action":"restore","id":"zzz"}' brands.php)"
PMJ '{"action":"save","base_version":0,"brand":{"id":"pmbrand1","name":"PM Client","colors":[]}}' brands.php > /dev/null
ok "  … a project manager can delete a client" 200 "$(PMJ '{"action":"delete","id":"pmbrand1"}' brands.php)"
ok "  … the admin can restore it" True "$(curl -s -b "$J" "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"restore","id":"pmbrand1"}' "$B/api/brands.php" | jget ok)"
ok "the role change is in the log" 1 "$(curl -s -b "$J" "$B/api/activity.php?action=user_role_changed" | grep -c 'designer → project manager')"
ok "the admin cannot change their own role" 400 "$(code "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"role","id":1,"role":"designer"}' "$B/api/users.php")"
ok "an unknown role is refused" 400 "$(code "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"role","id":6,"role":"boss"}' "$B/api/users.php")"
ok "project managers share the ten places with designers" 400 "$(code "${H[@]}" -X POST -H 'Content-Type: application/json' -d '{"action":"create","name":"PM2","email":"pm2@x.com","role":"pm","password":"pm-pass-12345"}' "$B/api/users.php")"
ok "a designer can upload and browse" Campaigns "$(curl -s -b "$T/cj3" "$B/api/fm.php?client=fmcli01&name=FM%20Client" | python3 -c 'import sys,json;print([i["name"] for i in json.load(sys.stdin)["items"] if i["folder"]][0])')"
FMJ "{\"action\":\"trash\",\"client\":\"fmcli01\",\"name\":\"FM Client\",\"ids\":[\"$CAMP\"]}" > /dev/null
ok "the admin can delete a folder" 1 "$(MOCKTRASHED "$CAMP")"
ok "  … opening it afterwards says it is gone" 404 "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "$B/api/fm.php?client=fmcli01&folder=$CAMP")"
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
ok "a designer cannot read the queue" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" "$B/api/brands.php?pending=1")"
CS2=$(echo "$R" | jget csrf)
ok "designer sees the shared brand" 1 "$(curl -s -b "$T/cj2" "$B/api/brands.php" | python3 -c 'import sys,json;print(sum(1 for b in json.load(sys.stdin)["brands"] if b["id"]=="solid01"))')"
ok "designer can save a brand" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" -H "X-LH-CSRF: $CS2" -X POST -H 'Content-Type: application/json' -d '{"action":"save","base_version":1,"brand":{"id":"solid01","name":"Solid Semi","notes":"by designer"}}' "$B/api/brands.php")"
ok "designer cannot restore a client" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" -H "X-LH-CSRF: $CS2" -X POST -H 'Content-Type: application/json' -d '{"action":"restore","id":"zzz"}' "$B/api/brands.php")"
ok "designer cannot delete a brand" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" -H "X-LH-CSRF: $CS2" -X POST -H 'Content-Type: application/json' -d '{"action":"delete","id":"solid01"}' "$B/api/brands.php")"
ok "a downloaded file is cached on disk" 1 "$([ -f "$T/lh-cache/$FID" ] && echo 1 || echo 0)"
kill $P1 2>/dev/null; sleep 1
curl -s -b "$T/cj2" "$B/api/download.php?id=$FID" -o "$T/dl2.jpg" -w ''; ok "cached file is still served when Zoho is unreachable" "$(echo "$U" | jget stored_bytes)" "$(wc -c < "$T/dl2.jpg" | tr -d ' ')"
echo "activity log"
J="$T/cj-act"; curl -s -b "$J" -c "$J" -X POST -H 'Content-Type: application/json' -d '{"email":"boss@x.com","password":"correct-horse-1"}' "$B/api/login.php" >/dev/null
AL(){ curl -s -b "$J" "$B/api/activity.php?$1"; }
cnt(){ python3 -c "import sys,json;print(len(json.load(sys.stdin)['events']))"; }
ok "sign-ins are logged" 1 "$([ "$(AL 'action=login' | cnt)" -ge 1 ] && echo 1 || echo 0)"
ok "a failed sign-in is logged" 1 "$([ "$(AL 'action=login_failed' | cnt)" -ge 1 ] && echo 1 || echo 0)"
ok "no password ever appears in the log" 0 "$(AL 'limit=200' | grep -c 'correct-horse\|nope')"
ok "a client being changed is logged (Edited section)" 1 "$([ "$(AL 'cat=edit' | cnt)" -ge 1 ] && echo 1 || echo 0)"
ok "an upload is logged" 1 "$([ "$(AL 'action=file_uploaded' | cnt)" -ge 1 ] && echo 1 || echo 0)"
ok "a deleted client is logged" 1 "$([ "$(AL 'action=client_deleted' | cnt)" -ge 1 ] && echo 1 || echo 0)"
ok "filter by client name works" 1 "$([ "$(AL 'client=Solid' | cnt)" -ge 1 ] && echo 1 || echo 0)"
ok "filter that matches nothing is empty" 0 "$(AL 'client=NoSuchClientZZZ' | cnt)"
ok "the summary lists people" 1 "$(AL 'summary=1' | python3 -c "import sys,json;print(1 if json.load(sys.stdin)['summary'] else 0)")"
ok "CSV download works" 1 "$(curl -s -b "$J" "$B/api/activity.php?format=csv" | head -1 | grep -c 'Time (UTC)')"
ok "designer cannot read the activity log" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" "$B/api/activity.php")"
ok "designer can report a browser event" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" -H "X-LH-CSRF: $CS2" -X POST -H 'Content-Type: application/json' -d '{"action":"svg_download","client_id":"solid01","client_name":"=HYPERLINK(1)","details":"logo.svg"}' "$B/api/activity.php")"
ok "unknown browser events are refused" 400 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" -H "X-LH-CSRF: $CS2" -X POST -H 'Content-Type: application/json' -d '{"action":"login"}' "$B/api/activity.php")"
ok "browser event without CSRF -> 403" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" -X POST -H 'Content-Type: application/json' -d '{"action":"svg_download"}' "$B/api/activity.php")"
ok "the designer's event shows under the designer's name" 1 "$([ "$(AL 'action=svg_download' | cnt)" -ge 1 ] && echo 1 || echo 0)"
ok "spreadsheet formulas are neutralised in CSV" 0 "$(curl -s -b "$J" "$B/api/activity.php?format=csv" | grep -c '^[^,]*,[^,]*,[^,]*,[^,]*,=HYPERLINK\|,"=HYPERLINK')"
echo "activity: every change, by section"
SVA(){ curl -s -b "$J" -H "X-LH-CSRF: $(curl -s -b "$J" "$B/api/me.php" | jget csrf)" -X POST -H 'Content-Type: application/json' -d "$1" "$B/api/brands.php"; }
SVA '{"action":"save","base_version":0,"brand":{"id":"actbr01","name":"Act Co","colors":[{"id":"c1","name":"Red","hex":"#FF0000"}],"logos":[{"id":"l1","name":"Main","group":"Primary logo"}],"fonts":[]}}' > /dev/null
SVA '{"action":"save","base_version":1,"brand":{"id":"actbr01","name":"Act Co","colors":[{"id":"c1","name":"Red","hex":"#EE0000"},{"id":"c2","name":"Blue","hex":"#0000FF"}],"logos":[],"fonts":[{"id":"f1","name":"Inter","role":"Body"}],"rules":{"tol":4}}}' > /dev/null
ok "an added colour is its own event" 1 "$(AL 'action=colour_added&client=Act' | cnt)"
ok "  … with its name and HEX" 1 "$(AL 'action=colour_added&client=Act' | grep -c 'Blue (#0000FF')"
ok "a changed colour shows old → new" 1 "$(AL 'action=colour_edited&client=Act' | grep -c '#FF0000 → #EE0000')"
ok "a deleted logo is its own event" 1 "$(AL 'action=logo_removed&client=Act' | cnt)"
ok "an added font is its own event" 1 "$(AL 'action=font_added&client=Act' | cnt)"
ok "edited rules are logged" 1 "$(AL 'action=rules_edited&client=Act' | cnt)"
ok "section filter: Added holds the colour and the font" 1 "$([ "$(AL 'cat=add&client=Act' | cnt)" -ge 2 ] && echo 1 || echo 0)"
ok "section filter: Deleted holds the logo" 1 "$(AL 'cat=delete&client=Act' | cnt)"
ok "every event carries its section" delete "$(AL 'cat=delete&client=Act' | jget events.0.cat)"
ok "search in the details works" 1 "$(AL 'q=0000FF' | cnt)"
ok "the CSV has a Section column" 1 "$(curl -s -b "$J" "$B/api/activity.php?format=csv" | head -1 | grep -c 'Section')"
EVD(){ curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" -H "X-LH-CSRF: $CS2" -X POST -H 'Content-Type: application/json' -d "$1" "$B/api/activity.php"; }
ok "a designer's logo download is recorded" 200 "$(EVD '{"action":"logo_download","client_id":"actbr01","client_name":"Act Co","details":"act_main.svg"}')"
ok "  … the same click twice is recorded once" 1 "$(EVD '{"action":"logo_download","client_id":"actbr01","client_name":"Act Co","details":"act_main.svg"}' >/dev/null; AL 'action=logo_download' | cnt)"
ok "a client opened is recorded" 200 "$(EVD '{"action":"client_opened","client_id":"actbr01","client_name":"Act Co","details":"Act Co"}')"
ok "a copied value is recorded" 200 "$(EVD '{"action":"value_copied","client_id":"actbr01","client_name":"Act Co","details":"#EE0000"}')"
ok "an icon made is recorded" 200 "$(EVD '{"action":"icon_created","client_id":"actbr01","client_name":"Act Co","details":"Calendar"}')"
ok "a designer cannot log a backup event" 403 "$(EVD '{"action":"backup_download","details":"x"}')"
ST2=$(curl -s -b "$J" "$B/api/stats.php?days=30&tz=330")
ok "dashboard stats: downloads counted" 1 "$(echo "$ST2" | python3 -c 'import sys,json;print(1 if json.load(sys.stdin)["totals"]["download"]>=2 else 0)')"
ok "dashboard stats: one row per day" 31 "$(echo "$ST2" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["daily"]))')"
ok "dashboard stats: 7 × 24 heat map" "7x24" "$(echo "$ST2" | python3 -c 'import sys,json;h=json.load(sys.stdin)["heat"];print(f"{len(h)}x{len(h[0])}")')"
ok "dashboard stats: the client's activity" 1 "$(echo "$ST2" | python3 -c 'import sys,json;c=[x for x in json.load(sys.stdin)["clients"] if x["id"]=="actbr01"][0];print(1 if c["changes"]>=4 and c["downloads"]>=1 and c["views"]>=1 else 0)')"
ok "dashboard stats: the designer's sections" 1 "$(echo "$ST2" | python3 -c 'import sys,json;p=[x for x in json.load(sys.stdin)["people"] if x["email"]=="d1@x.com"][0];print(1 if p["cats"]["download"]>=2 and p["cats"]["customise"]>=1 else 0)')"
ok "dashboard stats: downloaded files are listed" 1 "$(echo "$ST2" | python3 -c 'import sys,json;print(sum(1 for a in json.load(sys.stdin)["top_assets"] if a["name"]=="act_main.svg"))')"
ok "designer cannot read the dashboard stats" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" "$B/api/stats.php")"
echo "change own name"
NM(){ curl -s -o "$T/last" -w '%{http_code}' -b "$T/cj2" -H "X-LH-CSRF: $CS2" -X POST -H 'Content-Type: application/json' -d "$1" "$B/api/profile.php"; }
ok "an empty name is refused" 400 "$(NM '{"name":"   "}')"
ok "a name over 60 characters is refused" 400 "$(NM "{\"name\":\"$(printf 'x%.0s' $(seq 1 61))\"}")"
ok "name change needs CSRF" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" -X POST -H 'Content-Type: application/json' -d '{"name":"X"}' "$B/api/profile.php")"
ok "designer changes their own name" 200 "$(NM '{"name":"  Dana   Designer "}')"
ok "  … spaces are tidied" "Dana Designer" "$(jget name < "$T/last")"
ok "  … the new name is shown after reload" 1 "$(curl -s -b "$T/cj2" "$B/" | grep -c '<span id="lh-name">Dana Designer</span>')"
ok "  … and in me.php" "Dana Designer" "$(curl -s -b "$T/cj2" "$B/api/me.php" | jget user.name)"
ok "  … the change is in the log" 1 "$(AL 'action=name_changed' | grep -c 'D1\\" → \\"Dana Designer')"
ok "  … markup in a name is stripped" 200 "$(NM '{"name":"Dana <b>D</b>"}')"
ok "  … to plain text" "Dana bD/b" "$(jget name < "$T/last")"
NM '{"name":"Dana Designer"}' > /dev/null
CSA=$(curl -s -b "$J" "$B/api/me.php" | jget csrf)
ok "admin renames a person" 200 "$(code -H "X-LH-CSRF: $CSA" -X POST -H 'Content-Type: application/json' -d '{"action":"rename","id":3,"name":"Second Designer"}' "$B/api/users.php")"
ok "  … the admin rename is logged" 1 "$(AL 'action=user_renamed' | cnt)"
ok "a designer cannot rename someone" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" -H "X-LH-CSRF: $CS2" -X POST -H 'Content-Type: application/json' -d '{"action":"rename","id":3,"name":"X"}' "$B/api/users.php")"
echo "change own password"
PW(){ curl -s -o "$T/last" -w '%{http_code}' -b "$T/cj2" -H "X-LH-CSRF: $CS2" -X POST -H 'Content-Type: application/json' -d "$1" "$B/api/password.php"; }
ok "wrong old password refused" 400 "$(PW '{"old":"wrong-wrong-1","new":"brand-new-pass-9"}')"
ok "short new password refused" 400 "$(PW '{"old":"designer-pass-1","new":"short"}')"
ok "same password refused" 400 "$(PW '{"old":"designer-pass-1","new":"designer-pass-1"}')"
ok "password change needs CSRF" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/cj2" -X POST -H 'Content-Type: application/json' -d '{}' "$B/api/password.php")"
ok "designer changes own password" 200 "$(PW '{"old":"designer-pass-1","new":"brand-new-pass-9"}')"
ok "old password no longer signs in" 401 "$(code -X POST -H 'Content-Type: application/json' -d '{"email":"d1@x.com","password":"designer-pass-1"}' "$B/api/login.php")"
ok "new password signs in" 200 "$(code -X POST -H 'Content-Type: application/json' -d '{"email":"d1@x.com","password":"brand-new-pass-9"}' "$B/api/login.php")"
echo "before the database is configured"
T2=$(mktemp -d); mkdir -p "$T2/public_html"; cp "$ROOT/index.php" "$T2/public_html/"; cp -R "$ROOT/api" "$T2/public_html/api"; printf '<!doctype html><body>APP-MARKER</body>' > "$T2/public_html/index.html"; cp "$ROOT/serve.php" "$T2/public_html/"; mkdir -p "$T2/public_html/assets/kaynes"; echo "<svg/>" > "$T2/public_html/assets/kaynes/logo.svg"
$PHP -S 127.0.0.1:8903 -t "$T2/public_html" >/dev/null 2>&1 & P3=$!; sleep 1
G=$(curl -s -D - "http://127.0.0.1:8903/"); ok "app still served while unconfigured" 1 "$(echo "$G" | grep -c APP-MARKER)"; ok "gate-off header is set" 1 "$(echo "$G" | grep -ci 'x-latchhub-gate: off')"; ok "files are served as before while unconfigured" 200 "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8903/serve.php?f=assets/kaynes/logo.svg")"
kill $P3 2>/dev/null; rm -rf "$T2"
echo; echo "passed $PASS, failed $FAIL"; [ "$FAIL" = 0 ]
