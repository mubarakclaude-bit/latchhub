#!/usr/bin/env python3
"""
Copy the client files that live in this repository into Zoho WorkDrive, through the LatchHub connector.

  python3 tools/migrate_to_zoho.py --dry-run      # see what would be uploaded, nothing is sent
  python3 tools/migrate_to_zoho.py                # sign in as admin and upload
  python3 tools/migrate_to_zoho.py --only Kaynes  # just one client

Layout created inside the LatchHub folder in WorkDrive:
  <Client> / Brand assets / <group> / file        (from assets/<client>/…)
  <Client> / Original files / … / file            (from the client source folders: kaynes/, zari/, …)

Safe to re-run: files already uploaded are remembered in tools/.migrated-<site>.json and skipped.
Needs only Python 3 and curl (both are on macOS). Your password is typed hidden and sent only to your own site.
"""
import argparse, getpass, json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALLOWED = {'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'pdf', 'ai', 'eps', 'psd', 'indd', 'zip', 'mp4', 'm4v', 'mov', 'ttf', 'otf', 'woff', 'woff2',
           'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt'}
MAX_MB = 200
# client source folder in the repo -> asset slug of the brand it belongs to
SOURCE_FOLDERS = {'kaynes': 'kaynes', 'KIS': 'kis', 'kumaraguru': 'kumaraguru', 'sherwood': 'sherwood-high',
                  'solid semi': 'solid-semi', 'we school': 'weschool', 'zari': 'zari'}


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def pretty(part):
    return re.sub(r'[-_]+', ' ', part).strip().capitalize()


def load_brands():
    d = json.load(open(os.path.join(ROOT, 'brand-hub-data.json')))
    brands = d['brands'] if isinstance(d, dict) and 'brands' in d else d
    return {slug(b['name']): b for b in brands}


def walk(base, skip_thumbs=True):
    for dp, dn, fn in os.walk(base):
        dn[:] = sorted(x for x in dn if not x.startswith('.') and not (skip_thumbs and x == 'thumbs'))
        for f in sorted(fn):
            if f.startswith('.'):
                continue
            yield os.path.join(dp, f)


def plan(brands, only):
    """list of dicts: path, rel, client id/name, sub-folder, kind, size, skip reason"""
    items = []
    def add(path, brand, folder):
        ext = os.path.splitext(path)[1].lower().lstrip('.')
        size = os.path.getsize(path)
        why = None
        if ext not in ALLOWED:
            why = 'file type .%s is not allowed' % ext
        elif size > MAX_MB * 1048576:
            why = 'larger than %d MB' % MAX_MB
        elif size == 0:
            why = 'empty file'
        items.append(dict(path=path, rel=os.path.relpath(path, ROOT), id=brand['id'], name=brand['name'], folder=folder,
                          kind='auto' if ext == 'pdf' else 'asset', size=size, skip=why))
    ad = os.path.join(ROOT, 'assets')
    for s in sorted(os.listdir(ad)) if os.path.isdir(ad) else []:
        b = brands.get(s)
        if not b or (only and b['name'].lower() != only.lower()):
            continue
        base = os.path.join(ad, s)
        if not os.path.isdir(base):
            continue
        for p in walk(base):
            rel = os.path.relpath(os.path.dirname(p), base)
            parts = [] if rel == '.' else [pretty(x) for x in rel.split(os.sep)]
            add(p, b, '/'.join(['Brand assets'] + parts))
    for folder, s in SOURCE_FOLDERS.items():
        b = brands.get(s)
        base = os.path.join(ROOT, folder)
        if not b or not os.path.isdir(base) or (only and b['name'].lower() != only.lower()):
            continue
        for p in walk(base, skip_thumbs=False):
            rel = os.path.relpath(os.path.dirname(p), base)
            parts = [] if rel == '.' else rel.split(os.sep)
            add(p, b, '/'.join(['Original files'] + parts))
    return items


def mb(n):
    return '%.1f MB' % (n / 1048576)


def curl(args, stdin=None, timeout=1200):
    r = subprocess.run(['curl', '-s', '-m', str(timeout), '-w', '\n%{http_code}'] + args, input=stdin, capture_output=True, text=True)
    body, _, code = r.stdout.rpartition('\n')
    try:
        return int(code or 0), json.loads(body)
    except ValueError:
        return int(code or 0), {'error': (body or r.stderr or 'no reply').strip()[:200]}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--url', default='https://latchinfinity.com/LatchHub', help='address of your LatchHub site')
    ap.add_argument('--dry-run', action='store_true', help='only show what would be uploaded')
    ap.add_argument('--only', help='upload just this client (e.g. Kaynes)')
    a = ap.parse_args()
    brands = load_brands()
    items = plan(brands, a.only)
    todo = [i for i in items if not i['skip']]
    skipped = [i for i in items if i['skip']]
    by = {}
    for i in todo:
        by.setdefault(i['name'], [0, 0])
        by[i['name']][0] += 1
        by[i['name']][1] += i['size']
    print('Files to upload: %d (%s)' % (len(todo), mb(sum(i['size'] for i in todo))))
    for n, (c, s) in sorted(by.items()):
        print('  %-24s %4d files  %9s' % (n, c, mb(s)))
    for i in skipped:
        print('  skipped: %s (%s)' % (i['rel'], i['skip']))
    if a.dry_run or not todo:
        return
    # remembered per site address, so a test run against another address never hides real work
    MANIFEST = os.path.join(ROOT, 'tools', '.migrated-%s.json' % slug(a.url.split('://')[-1]))
    done = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    key = lambda i: '%s|%d' % (i['rel'], i['size'])
    todo = [i for i in todo if key(i) not in done]
    print('Already uploaded earlier: %d. Remaining: %d\n' % (len(items) - len(skipped) - len(todo), len(todo)))
    if not todo:
        print('Nothing left to do.')
        return
    base = a.url.rstrip('/')
    email = input('Admin email: ').strip()
    pw = getpass.getpass('Admin password (hidden): ')
    jar = tempfile.mktemp(prefix='lhjar')
    try:
        code, j = curl(['-c', jar, '-H', 'Content-Type: application/json', '--data-binary', '@-', base + '/api/login.php'], json.dumps({'email': email, 'password': pw}))
        pw = None
        if code != 200 or 'csrf' not in j:
            sys.exit('Sign-in failed: %s' % j.get('error', code))
        csrf = j['csrf']
        print('Signed in as %s.' % j['user']['name'])
        code, h = curl(['-b', jar, base + '/api/health.php'])
        if code != 200 or not h.get('all_ok'):
            print('Health check says something needs attention – open /admin.html and fix it first:')
            for c in h.get('checks', []):
                if not c['ok']:
                    print('  ✕ %s %s' % (c['check'], c['note']))
            sys.exit(1)
        ok = fail = 0
        failures = []
        for n, i in enumerate(todo, 1):
            esc = lambda s: s.replace('\\', '\\\\').replace('"', '\\"')
            args = ['-b', jar, '-H', 'X-LH-CSRF: ' + csrf, '--form-string', 'client=' + i['id'], '--form-string', 'client_name=' + i['name'],
                    '--form-string', 'kind=' + i['kind'], '--form-string', 'folder=' + i['folder'],
                    '-F', 'file=@"%s";filename="%s"' % (esc(i['path']), esc(os.path.basename(i['path']))), base + '/api/upload.php']
            code, r = curl(args)
            if code == 401:
                sys.exit('\nSession expired – run the script again (finished files are remembered).')
            if code == 200 and r.get('ok'):
                ok += 1
                done[key(i)] = r.get('id', '')
                json.dump(done, open(MANIFEST, 'w'))
                extra = ' (%s -> %s)' % (mb(r['original_bytes']), mb(r['stored_bytes'])) if r.get('stored_bytes') != r.get('original_bytes') else ''
                print('[%d/%d] ok    %s%s%s' % (n, len(todo), i['rel'], extra, '  ! ' + r['warning'] if r.get('warning') else ''))
            else:
                fail += 1
                msg = r.get('error', 'HTTP %s' % code)
                failures.append((i['rel'], msg))
                print('[%d/%d] FAIL  %s – %s' % (n, len(todo), i['rel'], msg))
        print('\nUploaded %d, failed %d.' % (ok, fail))
        for rel, msg in failures:
            print('  ✕ %s – %s' % (rel, msg))
        if failures:
            print('\nRun the script again to retry the failed files. If the message mentions the server upload limit, raise upload_max_filesize / post_max_size in hPanel → PHP Configuration.')
    finally:
        if os.path.exists(jar):
            os.remove(jar)


if __name__ == '__main__':
    main()
