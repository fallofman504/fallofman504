#!/usr/bin/env bash
# Backs up the Squiggle database and uploaded files into one dated archive.
# Runs nightly from cron (installed by setup.sh); run it by hand any time:
#
#   sudo ./deploy/backup.sh
#
# Keeps 14 days of archives locally and, if BACKUP_REMOTE is set in .env,
# copies each archive off-site with rclone.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
DATA=${SQUIGGLE_DATA_DIR:-$(pwd)/data}
DEST=${BACKUP_DIR:-$(pwd)/backups}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
STAMP=$(date +%Y-%m-%d_%H%M)
ARCHIVE="$DEST/squiggle-$STAMP.tar.gz"

mkdir -p "$DEST"
[ -f "$DATA/squiggle.db" ] || { echo "$(date -Is) no database at $DATA/squiggle.db — nothing to back up"; exit 1; }

# A consistent snapshot of the live database (safe while the site is running).
docker compose exec -T app node -e "
  require('better-sqlite3')('/data/squiggle.db', { readonly: true })
    .backup('/data/.backup-snapshot.db')
    .then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });"
trap 'rm -f "$DATA/.backup-snapshot.db"' EXIT

tar -czf "$ARCHIVE.partial" -C "$DATA" --transform 's|^\.backup-snapshot\.db$|squiggle.db|' .backup-snapshot.db uploads
mv "$ARCHIVE.partial" "$ARCHIVE"
chmod 600 "$ARCHIVE"
find "$DEST" -name 'squiggle-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) saved $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rclone copy "$ARCHIVE" "$BACKUP_REMOTE"
  echo "$(date -Is) copied off-site to $BACKUP_REMOTE"
else
  echo "$(date -Is) WARNING: BACKUP_REMOTE is not set, so this backup exists only on this server"
fi
