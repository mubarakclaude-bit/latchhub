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

## 3. Deploy the code from GitHub
hPanel → Websites → Manage → **Advanced → Git**: add the repository `https://github.com/mubarakclaude-bit/latchhub.git`, branch `main`, leave the directory empty so it deploys into `public_html`. For a private repo hPanel shows an SSH key – add it in GitHub → repo → Settings → Deploy keys. Turn on auto-deploy and add the webhook URL it shows in GitHub → repo → Settings → Webhooks. (Menu names can differ slightly; Hostinger's Git guide has the current screens.)

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
