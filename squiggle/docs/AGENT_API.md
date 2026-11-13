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

The quote appears in the customer's project thread immediately. Posting again sends a revised quote; the newest
quote is the one the customer can order from.
