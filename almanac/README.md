# Garden Almanac

A pocket farmer's almanac that runs entirely in the browser and works offline.

1. Enter a ZIP code. The app looks up the USDA hardiness zone (2023 map) and estimates your last spring and first fall frost dates, which you can adjust.
2. Pick a planting date (today by default). You get a checklist of plants grouped into **Plant now**, **Coming up** and **Later**.
3. Check the plants you want and press **🌱 Plant**. The report, sorted alphabetically, shows exact dates for sowing, germination, hardening off, transplanting, fertilizing, succession sowings and harvest. It also runs a companion-planting check.
4. Export the report as a calendar file (.ics, with reminders), an image, a PDF (print) or a CSV. You can also save it to **My Garden**, which tracks this week's tasks.

## Running it

- **Hosted (recommended for phones):** serve this folder over HTTPS, for example with GitHub Pages. On first visit a service worker caches everything. After that the app works with no connection and can be installed with *Add to Home Screen*.
- **Local file:** open `index.html` directly in a desktop browser. Everything except installing works this way.

After changing any file, bump `VERSION` in `sw.js` so installed copies update.

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/app.css`, `js/app.js` | The interface |
| `js/engine.js` | Frost dates, planting windows and schedule math (no DOM) |
| `data/plants.js` | Plant database: timing, fertilizer, companions. Add plants here |
| `data/zipdata.js` | 39,921 ZIP codes → zone, city and state (generated) |
| `tools/build-zipdata.js` | Regenerates `zipdata.js` from the source CSV |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support / installable app |
| `vendor/html2canvas.min.js` | Image export (MIT license) |

## Data sources

- USDA Plant Hardiness Zone Map 2023, ZIP edition: PRISM Climate Group, Oregon State University.
- Place names come from the `zipcodes` npm package.
- Planting timings are compiled from standard university extension planting guides.
- Frost dates are zone averages and can be off by weeks in coastal or mountain areas.
