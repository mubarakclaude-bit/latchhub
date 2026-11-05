# LatchHub – test scenarios

How to use: go down the list on the **live site**, mark ✔ / ✘ and note anything odd. **Auto** = already checked by the 130 automatic tests on every push (against a fake Zoho, not your real one), so on the live site you only need a quick confirmation. **Manual** = needs a person.
Use **two browsers** (or one normal + one private window) and, if possible, two computers: one for the admin, one for a designer.

Priority: **P1** = must pass before the team relies on it · **P2** = should pass · **P3** = nice to know.

---

## A. Accounts and sign-in
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| A1 | Open the site address while signed out | Sign-in page, no client data visible | Auto | P1 |
| A2 | Sign in with a correct email + password | App opens, your name and Sign out at the top right | Auto | P1 |
| A3 | Wrong password | "Wrong email or password." – stays on sign-in | Auto | P1 |
| A4 | 8 wrong attempts in a row | "Too many attempts. Wait 15 minutes." | Auto | P2 |
| A5 | Sign out, press the browser Back button | Still signed out; no client data shown | Manual | P1 |
| A6 | Admin adds a designer; designer signs in | Designer sees all clients, no Admin link | Manual | P1 |
| A7 | Admin switches a designer off while they are working | Their next save/upload is refused; they cannot sign in again | Manual | P1 |
| A8 | Add a 5th designer (limit is 1 admin + 4 designers) | Refused with a clear message | Auto | P2 |
| A9 | Designer opens `/admin.html` | "Only the admin can use this page" | Auto | P1 |
| A10 | Admin sets a new password for a designer | Old password stops working, new one works | Manual | P2 |
| A11 | Leave a signed-in tab idle for 10+ hours | Asked to sign in again; no data lost | Manual | P3 |
| A12 | Same person signed in on two computers | Both work | Manual | P2 |

## B. Files are protected
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| B1 | Signed out, open `…/LatchHub/brand-hub-data.json` | "Please sign in." (401), not the data | Auto + live check | P1 |
| B2 | Signed out, open a client logo address (`…/assets/kaynes/…svg`) | 401 | Auto + live check | P1 |
| B3 | Signed out, open `…/docs/` or `…/tools/` | 403 | Live check | P2 |
| B4 | Signed in, open any client | All logos display | Manual | P1 |
| B5 | The small logo on the sign-in page | Shows without signing in | Auto | P2 |
| B6 | After Hostinger cache purge, repeat B1/B2 ten times | Always 401 | Manual | P1 |

## C. Clients
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| C1 | **New brand** with a brand-book PDF, 3–10 MB | Colours, fonts, rules and logos detected; PDF smaller | Manual | P1 |
| C2 | New brand with **no** PDF, only typed colours | Created; no errors | Manual | P1 |
| C3 | New sub-brand under an existing client | Appears nested under the parent | Manual | P2 |
| C4 | Rename a client | New name everywhere; Zoho folder renamed | Auto (server) + Manual | P1 |
| C5 | Rename to a name that already exists in Zoho | Warning; folder keeps old name; nothing lost | Auto | P2 |
| C6 | Delete a client as admin | Disappears for everyone; Zoho folder in WorkDrive trash | Auto (server) + Manual | P1 |
| C7 | Delete a client as a designer | Refused: "Only the admin can delete a client" | Auto | P1 |
| C8 | Restore the deleted client on `admin.html` | Client and Zoho folder return | Auto | P1 |
| C9 | Delete a client that has sub-brands | Sub-brands remain, detached | Manual | P2 |
| C10 | Names with `<script>`, quotes, `&`, emoji, Tamil/Hindi text | Shown as plain text; no breakage | Manual | P1 |
| C11 | Very long client name (100+ characters) | Handled; Zoho folder created | Manual | P3 |
| C12 | Two designers create a client with the same name at the same time | Two entries or a clear warning; one Zoho folder; no crash | Manual | P2 |

## D. Colours, fonts, links, rules
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| D1 | Add a colour with `#F00`, `#FF0000`, `ff0000` | All accepted, shown as `#FF0000` | Manual | P2 |
| D2 | Edit, delete, copy a colour | Works; copy puts the HEX on the clipboard | Manual | P2 |
| D3 | Upload a font file (.ttf/.otf/.woff2) | Appears; text preview uses the font; file goes to Zoho | Manual | P2 |
| D4 | Add a link: `https://…` | Saved. `javascript:alert(1)` is refused | Manual | P1 |
| D5 | Export swatches (.ase) | Opens in Adobe apps with the right colours | Manual | P3 |
| D6 | Edit the rules text and the logo clear-space setting | Saved; Design Lens uses it | Manual | P2 |

## E. Logos
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| E1 | Upload **one colour SVG logo** | Original + **White** + **Greyscale** versions, each with SVG/PNG/JPG/square | Manual | P1 |
| E2 | The white version on a dark/transparent background | Parts that were white are see-through, not filled | Manual | P1 |
| E3 | Upload an SVG that is already white or black | No pointless extra versions | Manual | P2 |
| E4 | Upload an SVG with an embedded photo | Added; white/grey skipped with a message | Manual | P2 |
| E5 | Press **◐ White & grey** on an existing logo that already has them | "Nothing to add" | Manual | P2 |
| E6 | Upload PNG / JPG / WebP logos | Added with all formats | Manual | P1 |
| E7 | Upload a one-page logo PDF (vector) / (flat picture) | SVG created for vector; PNG only for flat | Manual | P2 |
| E8 | Delete a logo | Asks for confirmation; its files go to the Zoho trash | Auto (server) + Manual | P1 |
| E9 | Download each format (SVG, PNG, JPG, square, PDF) | Each downloads and opens correctly | Manual | P1 |
| E10 | Upload a 30 MB PNG | Works (sent in pieces) | Auto (pieces) + Manual | P2 |

## F. Brand-book PDFs
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| F1 | PDF under 3 MB | Stored as is | Manual | P2 |
| F2 | PDF 10–50 MB | Compressed (typically 70–85% smaller); pages all present | Manual | P1 |
| F3 | PDF 100 MB+ | Compressed and uploaded in pieces; no "arrived empty" error | Manual | P1 |
| F4 | PDF with vector logos | Logos listed with SVG/PNG/JPG/PDF; ✕ removes wrong ones | Manual | P1 |
| F5 | PDF of only photos (no vectors) | Colours/fonts read; "0 logos" and no crash | Manual | P2 |
| F6 | Password-protected or corrupt PDF | Clear message; nothing half-saved | Manual | P2 |
| F7 | PDF with 200+ pages | Finishes (slowly); browser stays responsive | Manual | P3 |
| F8 | Open / download the stored brand book | Opens; looks like the original | Manual | P1 |

## G. Zoho sync
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| G1 | New client with files | Folder `LatchHub/<Client>/Brand assets/…` appears in WorkDrive | Auto + Manual | P1 |
| G2 | Remove one logo | Only its files go to the WorkDrive trash | Auto | P1 |
| G3 | Delete a folder **by hand** in WorkDrive, then upload to that client | New folder is created; upload works | Auto | P1 |
| G4 | One file fails (e.g. wrong type) | Client is still saved for the team; corner shows "⚠ saved, but files not uploaded", click retries | Auto (server) + Manual | P1 |
| G5 | `admin.html` → **Test a real upload & download** | Every step ✓ (create, upload, find id, download, rename, trash) | Manual – **your real Zoho** | P1 |
| G6 | `admin.html` → health check | All required lines ✓ | Manual | P1 |
| G7 | Zoho clean-up queue | "Nothing waiting" after a delete | Manual | P1 |
| G8 | Revoke the Zoho key (or wrong secret) on a test copy | Uploads fail with a clear message; cached downloads still work | Manual | P2 |
| G9 | Upload while WorkDrive is slow/offline | Retries; corner shows the problem; work stays in the browser | Manual | P2 |
| G10 | Zoho trash retention | WorkDrive setting is 30 days | Manual (setting) | P2 |

## H. Two people at once
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| H1 | Designer A creates a client | Designer B sees it within ~1 minute | Auto (server) + Manual | P1 |
| H2 | A adds a logo, B watches | Logo appears for B within ~1 minute | Manual | P1 |
| H3 | A and B edit the same client, A saves first | B gets "Someone else just changed…" and sees A's version | Auto | P1 |
| H4 | Admin deletes a client while a designer has it open | Designer's screen drops it; no error loop | Manual | P2 |
| H5 | Designer works offline, then reconnects | Changes save, or a conflict message appears; nothing silently lost | Manual | P2 |
| H6 | New client created in a browser **before** the server existed | Pushed to the server on first load | Manual | P3 |

## I. Design Lens
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| I1 | A graphic post with correct logo in a corner | Logo found; spacing checks; no false "logo missing" | Manual | P1 |
| I2 | Wrong client selected | Red "This looks like a … creative" warning | Manual | P1 |
| I3 | Stretched / recoloured / missing logo | Each reported clearly | Manual | P1 |
| I4 | Photo-led post | Short list: logo, logo colour, text spacing, text colour only | Manual | P1 |
| I5 | Gradient post using brand colours | In-between colours accepted; off-brand blue still flagged | Manual | P1 |
| I6 | Low text contrast | Shows as a blue **TIP**, never lowers the score | Manual | P1 |
| I7 | Click a warning/fail | Design dims and the problem area is outlined; caption gives the fix | Manual | P1 |
| I8 | Formats: 1:1, 4:5, 9:16, 16:9, 1.91:1 | Right format named; Story safe zones used | Manual | P2 |
| I9 | Client with no logos / no colours | Clear note instead of errors | Manual | P2 |
| I10 | Huge image (8000 px), transparent PNG, video file | Handled without freezing | Manual | P3 |
| I11 | Run 20 real posts you consider **good** and 20 you consider **bad** | Good ≥ 80, bad flagged; list every disagreement for tuning | Manual | P1 |

## J. Admin portal
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| J1 | Add a designer with a short (<10) password | Refused | Auto | P2 |
| J2 | Add a designer with an email that exists | "Already has an account" | Auto | P3 |
| J3 | Deleted clients list shows a client you deleted | Restore works | Auto + Manual | P1 |
| J4 | Switch a designer off, then on | Access cut, then back | Manual | P2 |

## K. Security checks
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| K1 | A write request without the session token | Refused (403) | Auto | P1 |
| K2 | Upload `.php`, `.exe`, `.html` | Refused | Auto | P1 |
| K3 | Try `../` paths in file addresses | Refused | Auto | P1 |
| K4 | Open a Zoho file id that is not in LatchHub | Refused | Auto | P1 |
| K5 | Designer calls admin addresses directly | 403 | Auto | P1 |
| K6 | Open the site inside another site's frame | Should be blocked (**not done yet**: planned header) | Manual | P2 |
| K7 | Cookie settings | Secure + HttpOnly + SameSite | Live check | P2 |

## L. Browsers, screens, networks
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| L1 | Chrome, Safari, Edge, Firefox (latest) – A2, C1, E1, I1 | Same behaviour | Manual | P1 |
| L2 | Screens 1280, 1440, 1920 px wide; a tablet | Nothing cut off | Manual | P2 |
| L3 | Slow connection (browser dev tools "Slow 3G") while uploading | Progress shown; retries; no silent failure | Manual | P2 |
| L4 | **No dark mode:** set the computer to dark mode, open the app and admin page | Both stay light; no Light/Dark switch in Settings | Manual (checked once) | P1 |
| L5 | Keyboard only: tab through sign-in and a client page | Everything reachable, visible focus | Manual | P3 |

## M. Hosting and releases
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| M1 | Push a small change | Actions run green; change live within ~2 minutes | Manual | P1 |
| M2 | Push a change that breaks a test | Deploy is blocked; live site unchanged | Manual (test on a branch) | P1 |
| M3 | After a deploy, hard-refresh | New version loads, not a cached one | Manual | P2 |
| M4 | Restore the database from a Hostinger backup on a test copy | Clients return; Zoho links still work | Manual | P2 |
| M5 | PHP version switch to 8.3 on a test copy | Everything still works | Manual | P3 |

## N. Performance
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| N1 | 50 clients, ~500 logos | Home page under ~3 seconds | Manual | P2 |
| N2 | First view of a large client after a cache clear | Logos appear within a few seconds | Manual | P2 |
| N3 | 200 MB brand book | Completes; page does not freeze | Manual | P3 |

## O. Data and recovery
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| O1 | Backup button, then restore on a test copy | Same clients | Manual | P2 |
| O2 | Restore an **old** backup after logos were deleted | Warn: removed files were moved to the Zoho trash | Manual | P2 |
| O3 | Delete a client, wait for Zoho trash retention to pass, restore | Record returns; files gone (message explains) | Manual | P3 |

## P. SVG section (customise with approved colours)
| # | Scenario | Expected | Auto? | P |
|---|---|---|---|---|
| P1 | Open a client that has SVG logos | An **SVG** pill and section appear after Logos, one card per SVG logo | Manual (checked once) | P1 |
| P2 | Click **Customise & download** | A window opens with a preview and one row per colour in the file | Manual (checked once) | P1 |
| P3 | Choose a swatch for a colour | Preview changes at once; the chosen swatch is outlined | Manual (checked once) | P1 |
| P4 | Only approved colours are offered | The client's own colours (+ White and Black unless the client turned neutrals off) and nothing else | Manual (checked once) | P1 |
| P5 | "Use one approved colour for the whole logo" | Every colour becomes that colour; **Reset colours** undoes it | Manual (checked once) | P2 |
| P6 | Download **SVG** and **PNG** (try each PNG width) | Files open correctly; PNG has a transparent background; file name is `client_logo_custom` | Manual (checked once) | P1 |
| P7 | A logo whose white parts are meant to stay white (e.g. white letters on blue) | White stays white unless you change that row | Manual | P2 |
| P8 | Logos made by Illustrator (colours in a style block), with gradients, with `rgb()`/named colours, with no colour at all | Colours found and recoloured correctly | Checked on test files | P1 |
| P9 | A client with no colours yet | Clear message to add colours first | Manual (checked once) | P2 |
| P10 | An SVG that contains a picture | Warning that picture colours cannot change; vector parts still recolour | Manual | P3 |
| P11 | An SVG with a script or onclick inside | Downloaded file has them removed | Checked on test files | P1 |
| P12 | Logos stored on Zoho, on the site, and inline (older) | All three open in the window | Manual (Zoho and older checked once) | P1 |

---

### Suggested run order for the first full test (about 2–3 hours)
1. **Set-up:** health check (G6) and real-Zoho test (G5). Stop if either fails.
2. **Access:** A1–A9, B1–B6.
3. **Happy path:** C1, E1–E2, F2, F4, G1, H1–H2.
4. **Break it on purpose:** G3, G4, C6 → C8, H3, K2.
5. **Design Lens:** I1–I7, then I11 with 40 real posts.
6. **Browsers and screens:** L1, L2, L4.

Record every ✘ with a screenshot and the text in the corner of the screen, and send it for fixing.
