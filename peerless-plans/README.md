# Peerless Plans website (prototype)

Static site, no build step. Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
```

- `index.html`: home page with the public price list, the AI and QA page content, the guarantee, and owner services
- `order.html` + `order.js`: the self-serve order flow (drawing, details, upload, scope check, preview and price)
- `plan.js`: the sample floor plan drawing used in the hero and the preview
- `styles.css`: all styling

Not connected yet: file upload, preview generation, payment, and the Snapshot request form. Nothing entered leaves the browser.

Prices appear in both `index.html` and `order.js`; change them in both places.
