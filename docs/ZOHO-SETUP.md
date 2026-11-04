# LatchHub – Zoho WorkDrive + Hostinger setup

What this does: the website talks to small PHP files in `api/`. They sign people in (1 admin + 4 designers), compress uploads, and store/fetch files in your WorkDrive folder. The Zoho keys live in one private file on the server – never in GitHub or in the website.

## 1. Database (hPanel → Databases → MySQL Databases)
Create a database and a user (any names). Note the **database name, user and password**.

## 2. Private config file
In hPanel → File Manager, go to the folder that **contains** `public_html` (one level above it).
Create `lh-config.php` there, copy the contents of `lh-config.sample.php` from this repo, and fill in:
- the database name / user / password from step 1
- `client_id`, `client_secret`, `refresh_token` from your Zoho Self Client
- `setup_token`: make up a long random string (20+ characters)

## 3. Deploy the code from GitHub (GitHub Actions over SSH)
Every push to `main` runs the tests and then copies the changed files to `domains/latchinfinity.com/public_html/LatchHub/` with rsync over SSH (`.github/workflows/deploy.yml`).

1. **Turn on SSH** – hPanel → Advanced → **SSH Access**. Note the host, port and username. Create an SSH key pair and add the *public* key in hPanel (or authorise it there).
2. **Add GitHub secrets** – GitHub → repo → Settings → Secrets and variables → Actions:
   - `HOSTINGER_SFTP_HOST`, `HOSTINGER_SFTP_PORT`, `HOSTINGER_SFTP_USERNAME`
   - `HOSTINGER_SSH_PRIVATE_KEY` – the *private* key, the whole text including the BEGIN/END lines
3. **Switch off any other auto-deploy** into that folder (hPanel → Advanced → Git) so the two don't overwrite each other.
4. **Run it** – push to `main`, or GitHub → Actions → *Test and deploy to Hostinger* → *Run workflow*. The first run uploads everything (about 165 MB); later runs only what changed.

Files that exist only on the server are left alone (nothing is deleted), and `lh-config.php` lives above `public_html`, outside the repo.

## 4. First admin
Open `https://YOUR-DOMAIN/api/setup.php?token=YOUR_SETUP_TOKEN`, create the admin account. Then set `'setup_token' => ''` in `lh-config.php` to switch the page off.

## 5. Check Zoho
Open `https://YOUR-DOMAIN/admin.html`, sign in, press **Run health check**. Every required line should be ✓. Then add your four designers under **Add a person**.

## Notes
- PDF compression needs Ghostscript on the server. If the health check says it is missing, PDFs are stored as uploaded (images are still compressed).
- Large uploads depend on the server's `upload_max_filesize` / `post_max_size`; the health check shows them.
- Never paste the Zoho keys in chat or commit them. If they leak, delete the Self Client in the Zoho API Console and create a new one.

## Automated tests (for developers)
`PHP=/path/to/php bash tests/run-tests.sh` starts a fake Zoho and a copy of the site, then checks sign-in, permissions, compression, upload, listing and download. It never touches real Zoho.

## Moving the existing client files into Zoho
After the health check is green, on your Mac (needs Python 3 and curl, both already on macOS):
```
python3 tools/migrate_to_zoho.py --dry-run     # shows what would go where, sends nothing
python3 tools/migrate_to_zoho.py               # asks for your admin email + password (hidden), then uploads
```
Result in WorkDrive: `LatchHub / <Client> / Brand assets / <group> / file` and `LatchHub / <Client> / Original files / …`. Safe to run again – finished files are remembered and skipped. Use `--only Kaynes` for a single client. If a file fails with a message about the server upload limit, raise `upload_max_filesize` and `post_max_size` in hPanel → PHP Configuration and run it again.

## Shared clients and automatic Zoho storage (how the app behaves once signed in)
- Every client is stored on the server, so **all designers see the same clients**. A change made by one designer appears for the others within a minute (or when they return to the tab).
- When someone adds **logos, fonts, elements or a brand book** to a client (or creates a new client), the app first uploads those files to `LatchHub / <Client> / Brand assets / …` (brand books to `Brand book`) in WorkDrive, then saves the client with links to them. Look for "Saving files to Zoho…" next to your name at the top right.
- If two people edit the same client at the same time, the second save is refused and that person sees the first person's version (nothing is overwritten silently).
- Only the admin can delete a client. Files in Zoho are never deleted by the app.
- The first person to open the site after this version is deployed publishes the existing clients (and any clients created earlier in that browser) to the server.
- Downloads are cached on the server in a `lh-cache` folder next to `lh-config.php`; you can empty that folder any time.

## PDFs: automatic compression and logo extraction
When a brand-book PDF is added (new client, or dropped into "Upload logo files" on an existing client) the app, in the browser:
1. **finds the vector logos** in the PDF and stores each as **SVG, PNG, JPG, square PNG/JPG and a vector PDF**. Only logos drawn as vector shapes are found; a logo that is a flat picture inside the PDF (or live, non-outlined text) cannot become an SVG. Check the list and press ✕ on anything that is not a logo.
2. **compresses the PDF** (pages are re-drawn as compressed pictures; typically 70–85% smaller, text no longer selectable) before it is stored in Zoho. PDFs under 3 MB are left alone.
Logo PDFs of a single logo get an SVG as well when they are real vector artwork. Everything runs in the browser, so the server needs no PDF software.

## Files are only for signed-in people
`.htaccess` sends `/assets/…` and `/brand-hub-data.json` to `serve.php`, which checks the sign-in first. Quick check from any terminal (no password needed); both lines should say 401:
```
curl -s -o /dev/null -w "%{http_code}\n" https://YOUR-DOMAIN/LatchHub/brand-hub-data.json
curl -s -o /dev/null -w "%{http_code}\n" https://YOUR-DOMAIN/LatchHub/assets/kaynes/primary-logo/kaynes_primary-logo_full-colour.svg
```
If you see 200 instead, the host is ignoring `.htaccess` rewrite rules; tell the developer.

## Renaming a client
Renaming a client in the app also renames its folder in WorkDrive. If WorkDrive already has a folder with the new name, the app shows a warning and the old folder name stays (nothing is lost; files keep going to the same folder).
