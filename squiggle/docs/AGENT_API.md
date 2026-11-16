# Agent API

How Squiggle's back-end agents pick up customer requests and deliver quotes.

Every call needs the key from the `AGENT_API_KEY` environment variable:

```
Authorization: Bearer <AGENT_API_KEY>
```

## 1. Get the work queue

`GET /api/agent/requests` — requests waiting for a quote, oldest first.
Add `?status=quoted`, `ordered`, `closed`, or `all` to see others.

```json
{
  "requests": [
    {
      "id": "0b9c…",
      "ref": "SQ-S273N9",
      "title": "Sleepy armadillo desk planter",
      "prompt": "A desk planter shaped like a sleepy armadillo, about 5 inches long.",
      "intent": "undecided",
      "status": "submitted",
      "created_at": "2026-11-13T18:36:00.000Z",
      "quote_due_at": "2026-11-13T19:36:00.000Z",
      "customer": { "name": "Casey Customer", "email": "casey@example.com" },
      "files": [{ "id": "…", "kind": "reference", "filename": "doodle.png", "mime": "image/png", "size": 13211, "url": "https://…/api/files/…" }],
      "messages": [{ "sender": "customer", "body": "…", "at": "…" }],
      "quotes": [],
      "orders": []
    }
  ]
}
```

`GET /api/agent/requests/{id}` returns one request in the same shape. Download each file from its `url` with the
same `Authorization` header. `intent` is what the customer said they want: `stl`, `print`, or `undecided`.

### Two kinds of request

Each request has a `kind`:

- `custom` — the customer wants Squiggle to design something. Build the model and quote as described below.
- `print_only` — the customer uploaded their own finished 3D model (it's in `files`) and only wants it printed.
  There is nothing to design: check the model is printable, price it with the settings they chose, and send a print
  price breakdown. Don't send `stl_price_cents` (it's rejected); `turntable`, `render`, and `model` are optional.

### Print settings

When the customer chose print settings, the request carries them in `print_spec`, with a readable version in
`print_spec_summary`. Always present for `print_only`; present for `custom` when the customer picked "Print it for
me". Price and slice the print to these settings.

**Filament prints** match Creality Print exactly. The website's settings screen is generated from Creality Print's
own source code (the version is in `slicer`), so the categories, fields, choices and defaults are the ones you see in
the slicer. The spec names a stock profile and lists only what the customer changed from it:

```json
"print_spec": {
  "version": 2,
  "process": "filament",
  "material": "petg",
  "color": "Blue",
  "quantity": 3,
  "slicer": "Creality Print 7.3.2",
  "printer": "k1",
  "printer_name": "Creality K1 0.4 nozzle",
  "profile": "0.16",
  "profile_name": "0.16mm Standard @Creality K1 0.4 nozzle",
  "mode": "advanced",
  "overrides": {
    "sparse_infill_density": "40%",
    "sparse_infill_pattern": "gyroid",
    "wall_loops": "4",
    "enable_support": "1",
    "support_type": "tree(auto)"
  }
}
```

To reproduce it: select `printer_name`, select the process profile `profile_name`, then set each entry in
`overrides`. The keys are Creality Print's own setting names and the values are in its own format (`"1"`/`"0"` for
switches, `"40%"` for percentages, the internal name for dropdown choices), the same as in a saved profile `.json`.
An empty `overrides` means the stock profile as-is. `mode` only records whether the customer had the Advanced
switch on.

`print_spec_summary` gives the same thing in words, with where each setting lives and the stock value, for example
`"Strength › Infill › Sparse infill density: 40% (stock: 15%)"`.

Customers cannot set file names, notes, or post-processing scripts; those fields are deliberately left off the
website and rejected by the server.

**Resin prints** use a short spec, since Creality Print doesn't slice resin:

```json
"print_spec": { "process": "resin", "material": "standard", "color": "Gray", "layer": "0.05", "supports": "auto", "quantity": 1 }
```

Requests made before the slicer-matched settings existed carry the older short form for filament too (with
`layer`, `infill`, `supports` and `fuzzy_skin`); they have no `version` field.

Parts under 0.5 inch (12.7 mm) get a brim automatically; customers are told this when they choose settings.

## 2. Ask the customer a question (optional)

`POST /api/agent/requests/{id}/messages` with JSON `{ "body": "How big should it be?" }`.
Customer replies show up in the request's `messages`.

## 3. Deliver the quote

`POST /api/agent/requests/{id}/quote` as `multipart/form-data`:

| Field | Meaning |
| --- | --- |
| `items` | JSON array of `{ "label", "amount_cents" }` — the print price breakdown. The print total is their sum. Omit to offer the STL only. |
| `stl_price_cents` | Price for just the model file. Omit if not for sale. Requires `model`. |
| `delivery_cents` | Houston local delivery fee. Omit if delivery isn't offered. |
| `shipping_cents` | Shipping fee. Omit if shipping isn't offered. |
| `lead_time_days` | Estimated days to make. |
| `note` | Message shown to the customer with the quote. |
| `turntable` | Turntable video file (`.mp4` or `.webm`). |
| `render` | Render of the finished product (`.png`, `.jpg`, `.webp`). |
| `model` | The 3D model (`.stl`, `.3mf`, `.obj`). Customers can only download it after paying for the STL. |

Pickup is always offered and free. All amounts are whole cents. Files are limited to 50 MB each.

```bash
curl -X POST "$SITE/api/agent/requests/$ID/quote" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -F 'items=[{"label":"Design & modeling","amount_cents":3500},{"label":"Material (PLA, 180 g)","amount_cents":900},{"label":"Print time (6 h)","amount_cents":1305}]' \
  -F stl_price_cents=1800 -F delivery_cents=1500 -F shipping_cents=1200 -F lead_time_days=3 \
  -F 'note=Here is your armadillo! Modeled at 5 in long with a drainage hole.' \
  -F turntable=@turntable.mp4 -F render=@render.png -F model=@armadillo.stl
```

### Drafts and approval

What happens next depends on the request's `kind`:

- `print_only` — the quote appears in the customer's project thread immediately.
- `custom` — the quote is saved as a **draft**. A staff member reviews it in the Shop queue and either approves it
  (it is then sent to the customer exactly as posted) or discards it.

The response says which happened: `"delivered": true` or `"delivered": false`.

While a draft is waiting, the request is left out of the default work queue, so it won't be picked up twice, and it
appears under `draft_quotes` when you fetch the request. If staff discard the draft, the request returns to the
queue for another attempt.

The shop can change this with the `QUOTE_APPROVAL` setting: `custom` (default), `all` (hold every agent quote), or
`none` (send every agent quote straight through).

Posting again on a quoted request sends a revised quote; the newest sent quote is the one the customer can order
from.
