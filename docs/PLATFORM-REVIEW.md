# LatchHub – platform review and scenario analysis

Written after reading the whole code base, testing the live site from the outside, and walking through "what happens when…" for each part.
**Verified** = I checked it (live site or tests). **Judgement** = my assessment, please challenge it.

---

## 1. The most important finding

### The login protects the screen, not the files (Verified, high) — **FIXED in the next deploy**
> Update: client files now go through `serve.php`, which checks the sign-in first (stranger → "Please sign in.", signed-in person → the file, with caching). The sign-in page's own logo stays public. `docs/`, `tools/` and `tests/` are blocked outright, which also covers the stale copy on the server. Moving the seeded assets into Zoho is still a good later step (it would let us delete `assets/` from the site completely).

Anyone on the internet can open these **without signing in**:

| Address (under `/LatchHub/`) | What it gives |
|---|---|
| `assets/<client>/…` | every client logo (62 MB, all formats) |
| `brand-hub-data.json` | all 9 clients: names, colours, fonts, written rules (172 KB) |
| `tools/migrate_to_zoho.py` | my migration script (harmless, but it should not be public) |
| `docs/ZOHO-SETUP.md` | a stale copy of the setup guide, left from an earlier deploy |

Guessing a URL is not hard, because file names follow a pattern (`kaynes_primary-logo_full-colour.svg`).

**Recommended fix (in this order):**
1. Move the seeded client assets into Zoho (the migration script already copied them) and point the clients' records at the Zoho links. Then delete `assets/` and `brand-hub-data.json` from the public site. Everything is then served through `download.php`, which requires a login.
2. Until then, serve `assets/` and the data file through a small PHP gate that checks the session.
3. Stop deploying `tools/` (done in this change) and delete the stale `docs/` folder on the server by hand: the deploy only adds and updates, it never removes.

Effort: about a day, including testing. **This is the one item I would do before adding more features.**

---

## 2. What happens when… (scenarios)

### Deleting things
| Scenario | Today |
|---|---|
| Admin deletes a client | Zoho folder → **WorkDrive trash**; the client record is kept aside; admin can **Restore** it on `admin.html` ✔ (new) |
| Designer removes a logo / element / font / replaces the brand book | Only that item's Zoho files → trash ✔ (new). The logo record itself is gone (no undo) |
| A designer tries to delete a client | Refused, client reappears ✔ |
| Zoho is down during a delete | App finishes; the trash call is queued and retried automatically ✔ |
| A tampered request names a file LatchHub never uploaded | Ignored ✔ (tested) |
| Restoring after Zoho emptied its trash | Zoho keeps trash only 7–30 days (an admin setting in WorkDrive). Set it to **30 days**. After that the record can come back but the files cannot |
| Client **renamed** in the app | The Zoho folder is renamed too ✔ (new). If Zoho already has a folder with that name, the app says so and the folder keeps its old name; uploads keep going to the same folder either way |

### Two people at once
- Same client edited by two designers: the second save is refused and they see the first person's version ✔. The second person's change is lost, though. With 5 people that is acceptable; later, merge by section.
- Two designers create the same client name at the same moment: two records, one shared Zoho folder (found by name). Add a "this name already exists" warning.

### When something breaks
| Failure | What the team sees |
|---|---|
| Zoho refresh token revoked (e.g. the Zoho user changes password) | Uploads fail; cached downloads still work; there is no proactive alert (**gap**) |
| Hostinger database down | Login page says "temporarily unavailable" ✔ |
| Brand book too big for PHP limits | Clear message ✔; limits are 256M now |
| Bad deploy | Goes live immediately on every push to `main` (**gap**: no staging, no rollback) |
| Designer leaves | Deactivate in admin: blocked at their next request ✔ |
| Admin forgets their password | Locked out; no self-service reset (**gap**) |

---

## 3. Security

| # | Finding | Level | Suggestion |
|---|---|---|---|
| S1 | Public files (see §1) | **High** | gate / move to Zoho |
| S2 | No clickjacking protection, no HSTS, PHP version shown in a header (**Verified**) | Medium | add 3 header lines in `.htaccess` (X-Frame-Options, HSTS, hide X-Powered-By) |
| S3 | No "change my password"; no 2-factor sign-in | Medium | self-service password change; 2-factor for the admin account later |
| S4 | The Zoho key has `files.ALL` (includes permanent delete) although the app only needs create, read, update | Medium | regenerate the key with `CREATE,READ,UPDATE`; use a dedicated Zoho user that only sees the LatchHub folder, not a person's account |
| S5 | Login lock-out counts by IP **or** email: an outsider can lock a designer out; one noisy office IP can lock everyone | Low | count the pair (IP + email) and slow down progressively |
| S6 | No audit trail ("who changed this client?") | Low–Medium | keep the previous version of a client on every save (also gives undo) |
| S7 | Login cookie is Secure + HttpOnly + SameSite (**Verified**), HTTPS redirect works (**Verified**), links must be http(s) (**Verified**), CSRF token on every write (**Verified**), SQL is parameterised | — | good as is |

---

## 4. Data safety

1. **Single copy of the client records.** They live only in one MySQL database. Check that Hostinger backups are on, and add a nightly job that exports all clients as one JSON file into a `_backups` folder in Zoho (about 30 lines of PHP plus a Hostinger cron job).
2. **No undo.** Version history (S6) fixes accidental edits and gives the audit trail in one move.
3. **The Zoho disk cache** (`lh-cache`) has no size limit. Add an age-based clean-up.
4. **PDF compression keeps no original.** Logos are extracted first, so the vectors are safe, but add an optional "keep the original too" switch for brand books you may need to re-read later.

---

## 4b. Zoho integration

- Every Zoho call uses one shared token; Zoho throttles API use. The cache keeps repeat views off Zoho, but the first view of a big client after a clean-up could fire dozens of calls. Pre-warm after upload (planned improvement, low risk).
- Files added **by hand** in WorkDrive do not appear in the app. A per-client "Files in Zoho" panel (the server call already exists) would show them, including finished designs, with an "Open in WorkDrive" link.
- Folder names follow the client name, including later renames ✔.

---

## 5. Product and design-team scenarios

1. **Approved vs draft logos.** Add a status. The Design Lens should only use *approved* logos, otherwise a draft can pass a check.
2. **Auto white / greyscale versions** (new): a *black* version is the third common request in logo kits; same mechanism, small addition. Logos with embedded photos or text left as fonts are skipped (said on screen).
3. **PDF logo extraction** finds vector logos only, and sometimes also icons or pattern pieces. It already shows a list with ✕; show the "N more candidates" it skipped so a missed logo is one click away.
4. **Design Lens accuracy.** It was tuned on a handful of posts and has produced false alarms (e.g. a grey arrow read as text). Collect 20–30 real posts with the expected result and run them as a regression test; add a 👍/👎 on every finding to gather data from daily use.
5. **External sharing.** Printers and agencies will ask for "the logo pack". A time-limited share link per client (built on Zoho share links) beats email attachments.
6. **Usage insight.** `download.php` can count which assets are fetched most: useful to retire unused files.
7. **Names in other scripts.** File names are built from the client name; a name in Tamil or Hindi would produce empty slugs. Fall back to the client id.

---

## 6. Engineering health

- 88 automated back-end tests run on every push ✔. **The browser app has none**: add a small Playwright smoke test (sign in → add a client → delete it) to CI.
- The app is one large `index.html` plus a few scripts. It works, but it is getting hard to change safely; plan a gradual split into modules.
- No central error log. Add a small `lh_errors` table and a "recent problems" list on the admin page.
- Deploy: add a GitHub "production" environment with a manual approval and keep the previous release folder for a one-step rollback.
- PHP: the host runs 8.2; its security support ends in late 2026. Tests already pass on 8.3: switch in hPanel when convenient.
- The PDF reader library is pinned at 4.10 (2024); update it once a year.

---

## 7. Suggested order of work

1. ~~Gate or move public files (§1)~~ – gated; moving the seeded assets into Zoho is optional later
2. Security headers + narrower Zoho key + self-service password (S2–S4) – half a day
3. Version history/undo + nightly backup to Zoho – one day
4. "Files in Zoho" panel per client – half a day (client rename → folder rename is done)
5. Approved status for logos; black version; share links
6. Browser smoke tests and staging deploy
