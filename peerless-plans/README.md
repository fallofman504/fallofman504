# Peerless Plans website

The public site and order desk for Peerless Plans, a commercial real estate drafting studio in Houston, TX.
Same stack as [Squiggle](../squiggle): Next.js, SQLite, Stripe Checkout, Docker behind a Cloudflare Tunnel.

## How an order moves

1. A guest picks a drawing (spec test fit, prospect test fit or lease exhibit), describes the space, uploads reference
   material and confirms the scope. No account is needed; they get a private order link by email.
2. The drafting agents pick the order up through the [agent API](docs/AGENT_API.md) and post the draft sheet. The site
   crops and watermarks it, and emails the guest.
3. The guest sees the preview and the flat price, then buys, adjusts the request, or starts over.
4. Payment goes through Stripe Checkout. The order lands in the review queue at `/admin`.
5. The founder checks the final files and signs. Only then can the guest download them.

Prices live in one place, `src/lib/pricing.ts`, and are always worked out on the server.

## Run it locally

```bash
npm install
```

```bash
cp .env.example .env.local
```

Set `ADMIN_PASSCODE` and `AGENT_API_KEY` in `.env.local`, then:

```bash
npm run dev
```

With no Stripe key, checkout is simulated and emails are printed in the terminal.

## Put it online

See [docs/DEPLOY.md](docs/DEPLOY.md).

## Not built yet

- Residential drawings (commercial first).
- Self-serve ordering for area audits, onboarding, retainers and 3D maps; the site lists them and collects
  Free Variance Snapshot requests.
- A pause on new orders when the review queue is full.
- Automatic deletion of files from cancelled or abandoned orders.
