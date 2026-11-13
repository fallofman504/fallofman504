# Hosting Squiggle on your own server

The site runs on any small 64-bit Linux machine (Debian, Ubuntu, or Raspberry Pi OS) and is reached through a
Cloudflare Tunnel, so no ports are opened on your router and your IP address stays private.

## What you need

- A domain on Cloudflare (buy it there, or move its nameservers there).
- A server. On a Raspberry Pi: a Pi 4 or 5 with 4 GB+ memory, the **64-bit** Raspberry Pi OS Lite, booting from an SSD
  over USB rather than an SD card. A battery backup (UPS) is worth having.
- This repository cloned onto the server:
  ```bash
  sudo apt-get install -y git
  git clone https://github.com/fallofman504/fallofman504.git
  cd fallofman504/squiggle
  ```

## 1. Create the tunnel (in Cloudflare, about 5 minutes)

1. Go to **dash.cloudflare.com → Zero Trust → Networks → Tunnels → Create a tunnel**.
2. Choose **Cloudflared**, name it `squiggle`, and save.
3. On the install screen, copy the long token (the text after `--token` in the command shown). You don't need to run
   that command; the setup script runs the tunnel for you.
4. Under **Public Hostname**, add one:
   - **Domain:** your domain (leave subdomain blank, or use `www`)
   - **Service:** `HTTP` → `app:3000`

## 2. Run the setup script

```bash
sudo ./deploy/setup.sh
```

It asks for your domain, the email(s) that should get the Shop queue, where to keep data and backups, the tunnel
token, and (optionally) your Stripe keys. Then it:

- installs Docker,
- writes your settings to `.env` (readable only by root) and generates the agent API key,
- builds and starts the site and the tunnel,
- schedules a backup every night at 3:15 AM,
- turns on automatic security updates for the operating system.

Both the site and the tunnel restart on their own after a crash or a reboot. Run the script again any time to change
an answer; it keeps your existing values as the defaults.

When it finishes, open `https://your-domain` and sign up with your admin email.

## 3. Turn on off-site backups

The nightly backup saves one archive (database + uploaded files) into your backup folder and keeps 14 days. Until you
do this step, those copies exist only at the same location as the server.

Cloudflare R2 works well and is free for the first 10 GB:

1. In Cloudflare: **R2 → Create bucket** named `squiggle-backups`, then **Manage R2 API Tokens → Create API token**
   with *Object Read & Write* on that bucket. Note the Access Key ID, Secret Access Key, and your account's S3 endpoint.
2. On the server, run `sudo rclone config` and create a remote named `r2`: type **s3**, provider **Cloudflare**, then
   paste the key, secret, and endpoint.
3. Edit `.env` and set `BACKUP_REMOTE=r2:squiggle-backups`.
4. Test it: `sudo ./deploy/backup.sh` — the last line should say "copied off-site".

Run rclone config with `sudo` so the nightly job, which runs as root, can find it. Any other rclone destination
(Backblaze B2, Google Drive, another computer) works the same way.

## Restoring from a backup

```bash
docker compose down
sudo tar -xzf /path/to/squiggle-2026-11-13_0315.tar.gz -C /path/to/data-folder   # the SQUIGGLE_DATA_DIR in .env
sudo rm -f /path/to/data-folder/squiggle.db-wal /path/to/data-folder/squiggle.db-shm
sudo chown -R 1000:1000 /path/to/data-folder
docker compose up -d
```

Try a restore once before you launch, so you know the backups work.

## Day to day

| Task | Command |
| --- | --- |
| Update to the latest code | `sudo ./deploy/update.sh` (backs up first) |
| See what the site is doing | `docker compose logs -f app` |
| Check the tunnel | `docker compose logs tunnel` |
| Restart everything | `docker compose restart` |
| Back up right now | `sudo ./deploy/backup.sh` |
| Check last night's backup | `tail /var/log/squiggle-backup.log` |

## Stripe on the live site

Add your keys by re-running `sudo ./deploy/setup.sh`. In Stripe, create a webhook endpoint at
`https://your-domain/api/stripe/webhook` for `checkout.session.completed` and
`checkout.session.async_payment_succeeded`, and give the script its signing secret.
