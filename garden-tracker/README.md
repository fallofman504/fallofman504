# 🌷 Garden Tracker

A phone app (a Progressive Web App) for logging community garden shifts and exporting nice-looking day and week reports.

- **Your name**: shown at the top of the Today screen (defaults to Nicky) and printed on every report as "Prepared by".
- **Clock in / Clock out**: one big button. Shifts can be edited or added by hand (✎) if she forgets.
- **Photos**: **📷 Take Photo** uses the camera; **🖼 Choose Photos** picks from the library. Each photo is stamped bottom-left with the time it was taken, read from the photo's "date taken" metadata. If a photo has no "date taken" (some shared or downloaded photos don't), it's marked **check time**, and tapping any photo lets her see where the time came from and fix it.
- **Reflection notes**: saved automatically as she types.
- **Volunteers**: names she has used before show up as one-tap suggestions.
- **Export Day Report**: shows a progress spinner, then a "report ready" card with a **Share / Save PDF** button (Save to Files, Mail, Messages…). The day is filed under Daily Reports and the Today form resets to blank.
- **Daily Reports**: tap a day to edit (finish with **Done**), re-export, or delete it. **Select → Export Week** makes one PDF with a combined time sheet and hour totals, all the reflection notes, the volunteers and which days each one came, and every photo in chronological order.
- **Weekly Reports**: past week reports. Opening one rebuilds it from the latest daily entries.
- If she forgets to export, that day is filed automatically the next time she opens the app.
- **Works offline** at the garden. All data stays on her phone (IndexedDB). There is no server and no account.

## Hosting (free, with GitHub Pages)

1. On GitHub, go to this repo → **Settings → Pages**.
2. Under "Build and deployment", set Source to **Deploy from a branch**, choose `main` and `/ (root)`, then click Save.
3. After a minute the app is live at `https://fallofman504.github.io/fallofman504/garden-tracker/`.

## Installing on her phone

- **iPhone (Safari):** open the link, tap **Share → Add to Home Screen**.
- **Android (Chrome):** open the link, tap **⋮ → Add to Home screen / Install app**.

It then opens full-screen from its own icon, like a regular app.

## Good to know

- Data lives only on that phone, in that browser. If she deletes the app from the home screen, or clears Safari website data, her saved days are erased. Export the week PDFs (they are the real record) and keep them somewhere safe.
- On iPhone, use the home-screen icon rather than a Safari tab. iOS can clear data for websites that aren't opened for a few weeks, but installed home-screen apps are exempt.
- The version number (e.g. "Garden Tracker v4") is shown in small print at the bottom of the Today and Weekly Reports screens. With every update, bump `APP_VERSION` in `js/version.js`, `VERSION` in `sw.js`, and the `?v=` number on `js/app.js` in `index.html` and `sw.js`.
- If something fails, the app shows a "Something went wrong" card with the details. A screenshot of it is all that's needed to diagnose the problem.

## Running locally

```sh
cd garden-tracker
python3 -m http.server 8000   # then open http://localhost:8000
```
