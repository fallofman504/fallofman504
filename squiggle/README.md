# Squiggle

Website for Squiggle, a 3D print and custom design/fabrication shop in Houston, TX.

There are two ways in. **Print my model**: the customer uploads a finished 3D model, picks print settings, and gets a
print quote. **Custom design**: a customer creates an account and sends a text prompt and/or reference photos and 3D files. Squiggle's back-end agents
build the model and post a quote (price breakdown, turntable video, render) into the customer's project thread. The
customer then either buys the STL and downloads it, or orders a print with pickup, Houston delivery, or shipping —
paying a 50% deposit up front and the balance at pickup or before it goes out.

## Run it

```bash
cp .env.example .env.local   # then edit
npm install
npm run dev                  # http://localhost:3000
```

- Sign up with an email listed in `ADMIN_EMAILS` to get the **Shop queue** (`/admin`).
- With `STRIPE_SECRET_KEY` blank, checkout goes to a simulated payment page (development only).
  In production the site refuses to take orders until Stripe is configured.

## Stripe

1. Put your secret key in `STRIPE_SECRET_KEY` (use a `sk_test_…` key first).
2. Add a webhook endpoint in Stripe pointing at `https://<your-domain>/api/stripe/webhook` for the event
   `checkout.session.completed` (and `checkout.session.async_payment_succeeded`), and put its signing secret in
   `STRIPE_WEBHOOK_SECRET`. Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
3. Set `APP_URL` to the public site URL so Stripe can send customers back.

Payments use Stripe Checkout. Each order creates one payment for an STL (full price) or two for a print
(deposit, then balance). A payment is recorded both by the webhook and when the customer returns from checkout.

## How the pieces fit

| Path | What it is |
| --- | --- |
| `src/lib/db.ts` | SQLite schema (users, requests, files, quotes, messages, orders, payments) |
| `src/lib/data.ts` | All database reads/writes |
| `src/lib/auth.ts` | Passwords, sessions, admin and agent checks |
| `src/lib/payments.ts` | Stripe Checkout, simulated checkout, and what happens when a payment lands |
| `src/lib/print-options.ts` | The print menu: materials, colors, layer heights, infill, supports, brim threshold. Edit to match the shop. |
| `src/lib/storage.ts` | Upload validation and file storage |
| `src/app/actions.ts` | Signup/login, messages, placing orders, admin order steps |
| `src/app/api/agent/*` | API the back-end agents use — see [docs/AGENT_API.md](docs/AGENT_API.md) |
| `src/app/api/files/[id]` | Access-controlled file serving (the model is locked until the STL is paid for) |

## Hosting

[docs/DEPLOY.md](docs/DEPLOY.md) covers self-hosting on a small Linux server or Raspberry Pi behind a Cloudflare
Tunnel: `sudo ./deploy/setup.sh` installs and starts everything, with nightly backups.

Data lives in `./data` (SQLite file + uploads), or wherever `DATA_DIR` points. Host it somewhere with a persistent
disk (a VPS, Fly.io, Railway, Render); serverless hosts like Vercel would need the database and file storage swapped
for hosted services first.
