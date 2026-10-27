# LatchHub

Brand asset hub for Latch Infinity clients – colours, logos, fonts, elements, rules and brand books.

## Run
```bash
python3 -m http.server 8000
```
Open http://localhost:8000/index.html (use the server – Smart import needs it).

## Layout
- `index.html` – the app · `js/` – icon generator, home/theme, Smart import · `vendor/` – pdf.js (Apache-2.0)
- `brand-hub-data.json` – seeded clients · `assets/` – logos (SVG/PNG/JPG/square), elements, brand books
- Client source folders (`kaynes/`, `zari/`, …) – original files
- `kaynes/kaynes stylescape.pdf` is a compressed copy (11 MB); the 123 MB original is not in git.
- Company logo: drop `assets/latchhub/logo.svg` (or `.png`).
