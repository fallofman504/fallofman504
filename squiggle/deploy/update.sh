#!/usr/bin/env bash
# Pulls the latest code and restarts the site. Takes a backup first.
#
#   sudo ./deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
./deploy/backup.sh || echo "Backup skipped (nothing to back up yet)."
sudo -u "$(stat -c %U .)" git pull --ff-only # as the folder's owner, not root
docker compose pull tunnel
docker compose up -d --build
docker image prune -f >/dev/null
echo "Updated."
