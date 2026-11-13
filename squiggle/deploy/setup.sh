#!/usr/bin/env bash
# One-command server setup for Squiggle on Debian / Ubuntu / Raspberry Pi OS (64-bit).
#
#   sudo ./deploy/setup.sh
#
# Installs Docker, asks a few questions, writes .env, starts the site and the
# Cloudflare Tunnel, and schedules nightly backups and automatic security updates.
# Safe to run again: existing answers in .env are kept as the defaults.
set -euo pipefail

cd "$(dirname "$0")/.."
APP_DIR=$(pwd)

[ "$(id -u)" -eq 0 ] || { echo "Please run with sudo: sudo ./deploy/setup.sh"; exit 1; }
command -v apt-get >/dev/null || { echo "This script supports Debian, Ubuntu and Raspberry Pi OS."; exit 1; }
case "$(uname -m)" in
  x86_64 | aarch64) ;;
  *) echo "A 64-bit system is required (found $(uname -m)). On a Raspberry Pi, install the 64-bit Raspberry Pi OS."; exit 1 ;;
esac

# ---------- helpers ----------
current() { [ -f .env ] && grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }
ask() { # ask VAR "Question" "default"
  local existing answer
  existing=$(current "$1")
  local default=${existing:-$3}
  read -r -p "$2${default:+ [$default]}: " answer
  printf -v "$1" '%s' "${answer:-$default}"
}
ask_secret() { # ask_secret VAR "Question"  (blank keeps the current value)
  local existing answer
  existing=$(current "$1")
  read -r -s -p "$2${existing:+ [press Enter to keep current]}: " answer
  echo
  printf -v "$1" '%s' "${answer:-$existing}"
}

# ---------- 1. packages ----------
echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl openssl cron unattended-upgrades rclone >/dev/null
if ! command -v docker >/dev/null; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || apt-get install -y -qq docker-compose-plugin >/dev/null

# ---------- 2. questions ----------
echo
echo "A few questions. Press Enter to accept the value in [brackets]."
echo
ask DOMAIN "Your domain, without https:// (e.g. squiggle3d.com)" "$(current APP_URL | sed 's|https://||')"
[ -n "$DOMAIN" ] || { echo "A domain is required."; exit 1; }
ask ADMIN_EMAILS "Email(s) that get the Shop queue, comma-separated" ""
ask SQUIGGLE_DATA_DIR "Folder for the database and uploaded files (e.g. on your SSD)" "$APP_DIR/data"
ask BACKUP_DIR "Folder for local backup copies (ideally a different drive)" "$APP_DIR/backups"
echo
echo "Cloudflare Tunnel token: dash.cloudflare.com -> Zero Trust -> Networks -> Tunnels -> Create a tunnel."
echo "(Step-by-step in docs/DEPLOY.md.)"
ask_secret CLOUDFLARE_TUNNEL_TOKEN "Tunnel token"
[ -n "$CLOUDFLARE_TUNNEL_TOKEN" ] || { echo "A tunnel token is required."; exit 1; }
echo
echo "Stripe keys are optional for now. Without them the site shows but can't take orders."
ask_secret STRIPE_SECRET_KEY "Stripe secret key (sk_...)"
ask_secret STRIPE_WEBHOOK_SECRET "Stripe webhook signing secret (whsec_...)"

AGENT_API_KEY=$(current AGENT_API_KEY)
[ -n "$AGENT_API_KEY" ] && [ "$AGENT_API_KEY" != "change-me-to-a-long-random-string" ] || AGENT_API_KEY=$(openssl rand -hex 32)
BACKUP_REMOTE=$(current BACKUP_REMOTE)

# ---------- 3. write settings ----------
umask 077
cat > .env <<ENV
# Written by deploy/setup.sh. Re-run that script to change these, or edit and run: docker compose up -d
APP_URL=https://$DOMAIN
ADMIN_EMAILS=$ADMIN_EMAILS
AGENT_API_KEY=$AGENT_API_KEY
STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET
CLOUDFLARE_TUNNEL_TOKEN=$CLOUDFLARE_TUNNEL_TOKEN
SQUIGGLE_DATA_DIR=$SQUIGGLE_DATA_DIR
BACKUP_DIR=$BACKUP_DIR
# Off-site backups: an rclone destination such as r2:squiggle-backups (see docs/DEPLOY.md)
BACKUP_REMOTE=$BACKUP_REMOTE
ENV
chmod 600 .env
umask 022

mkdir -p "$SQUIGGLE_DATA_DIR" "$BACKUP_DIR"
chown -R 1000:1000 "$SQUIGGLE_DATA_DIR" # the site runs as an unprivileged user inside its container
chmod 700 "$SQUIGGLE_DATA_DIR" "$BACKUP_DIR"

# ---------- 4. start ----------
echo
echo "==> Building and starting Squiggle (the first build takes several minutes on a Raspberry Pi)"
docker compose up -d --build

echo -n "==> Waiting for the site to come up "
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/login; then UP=1; break; fi
  echo -n "."; sleep 2
done
echo
[ "${UP:-}" = 1 ] || { echo "The site didn't start. Check: docker compose logs app"; exit 1; }

# ---------- 5. backups + security updates ----------
chmod +x deploy/backup.sh deploy/update.sh
cat > /etc/cron.d/squiggle-backup <<CRON
# Nightly Squiggle backup at 3:15 AM
15 3 * * * root $APP_DIR/deploy/backup.sh >> /var/log/squiggle-backup.log 2>&1
CRON
cat > /etc/apt/apt.conf.d/20auto-upgrades <<APT
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT
systemctl enable --now cron >/dev/null 2>&1 || true

cat <<DONE

Squiggle is running.

  Site:          https://$DOMAIN   (once the tunnel's public hostname points at http://app:3000)
  Shop queue:    sign up on the site with one of: $ADMIN_EMAILS
  Agent API key: stored in $APP_DIR/.env (AGENT_API_KEY)
  Backups:       nightly at 3:15 AM into $BACKUP_DIR$( [ -n "$BACKUP_REMOTE" ] && echo " and $BACKUP_REMOTE" || echo "  (off-site copy NOT set up yet — see docs/DEPLOY.md)")

  Logs:    docker compose logs -f app
  Update:  sudo ./deploy/update.sh
DONE
