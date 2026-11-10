# 🌷 Garden Tracker

A phone app (a Progressive Web App) for logging community garden shifts and exporting nice-looking day and week reports.

- **Clock in / Clock out**: one big button. Shifts can be edited or added by hand (✎) if she forgets.
- **Photos**: the date and time are read from the photo's camera metadata (EXIF) and stamped in the bottom-left corner. If a photo has no camera date, the file date is used and the photo gets a "file date" tag.
- **Reflection notes**: saved automatically as she types.
- **Volunteers**: names she has used before show up as one-tap suggestions.
- **Export Day Report**: makes a PDF and opens the phone's share sheet (Save to Files, Mail, Messages…).
- **Daily Reports → Select → Export Week**: one PDF with a combined time sheet and hour totals, all the reflection notes, the volunteers and which days each one came, and every photo in chronological order.
- **Weekly Reports**: past week reports. Opening one rebuilds it from the latest daily entries.
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
- When you change the app's files, bump `VERSION` in `sw.js` so phones pick up the update.

## Running locally

```sh
cd garden-tracker
python3 -m http.server 8000   # then open http://localhost:8000
```
