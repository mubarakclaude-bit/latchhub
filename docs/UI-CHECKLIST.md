# UI checklist – run before every push (interface only)

1. `python3 -m http.server 8000` in the repo, open `http://localhost:8000/index.html`.
2. Open the browser console, paste all of `tests/ui-audit.js`, press Enter. It must report **0 problems**
   (menu order = page order, logos only under Logos, colour cards under Colors, patterns under Elements,
   counts of colours/logos/fonts/elements/sub-brands match the data, no broken images, no sideways scroll).
3. Look at: Home list (logos aligned, hover), Zari (sub-brands, colour reference, logos on colour), Kaynes (elements),
   Solid Semi (empty brand), a sub-brand, Design Lens, Edit mode on, Settings menu (Backup / Restore / theme / New brand),
   light + dark theme, and a phone width.
4. Back-end files (`api/`, `serve.php`, `js/sync.js`, `lh-config*`, data json) must show no changes in `git diff --stat`.
