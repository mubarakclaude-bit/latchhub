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
