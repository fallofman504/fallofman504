# Hosting Peerless Plans on your own server

This runs the same way as Squiggle: a Docker container reached through a Cloudflare Tunnel, with no ports opened on
your router. It can sit on the same server as Squiggle; it uses its own tunnel and its own data folder.

## 1. Create the tunnel

1. In the Cloudflare dashboard go to **Networking → Tunnels** and select **Create a tunnel**. Name it `peerless`.
2. Copy the long token from the installation command (the text after `--token`). Treat it like a password.
3. Open the tunnel, go to the **Routes** tab, and select **Add route → Published application**:
   - **Subdomain:** leave blank &nbsp; **Domain:** your domain
   - **Service URL:** `http://app:3000`

## 2. Write the settings

On the server, in this folder:

```bash
cp .env.example .env
```

```bash
chmod 600 .env
```

Edit `.env`:

- `APP_URL`: `https://your-domain`
- `ADMIN_PASSCODE`: a long passcode for the review queue
- `FOUNDER_NAME`: your name as it appears in the title block
- `ADMIN_EMAIL`: where order notices go
- `AGENT_API_KEY`: a long random string; `openssl rand -hex 32` makes one
- `CLOUDFLARE_TUNNEL_TOKEN`: the token from step 1 (remove the `#`)
- `PEERLESS_DATA_DIR`: where orders and uploaded files are kept, for example `/var/lib/peerless` (remove the `#`)
- the SMTP lines, so customers get their order links (the same provider as Squiggle works)

## 3. Connect Stripe

1. In Stripe, copy the **secret key** into `STRIPE_SECRET_KEY`. Use a test key (`sk_test_…`) first.
2. Under **Developers → Webhooks**, add an endpoint at `https://your-domain/api/stripe/webhook` for the events
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
3. Copy that endpoint's **signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.

Without a Stripe key the live site refuses checkout rather than simulating it.

## 4. Start it

```bash
sudo docker compose up -d --build
```

Open `https://your-domain`, place a test order, then sign in at `https://your-domain/admin`.

To update later:

```bash
git pull && sudo docker compose up -d --build
```

## Backups

Everything worth keeping is in the data folder (`peerless.db` and `uploads/`). Squiggle's nightly backup script only
covers Squiggle's folder; add this one to it before taking paid orders.

## Upload size

Cloudflare limits a single upload to 100 MB on the free plan, so the order form accepts up to 8 files and 90 MB in
total per order.
