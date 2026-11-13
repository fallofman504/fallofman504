#!/usr/bin/env bash
# Backs up the Squiggle database and uploaded files into one dated archive.
# Runs nightly from cron (installed by setup.sh); run it by hand any time:
#
#   sudo ./deploy/backup.sh
#
# Keeps 14 days of full archives locally. If BACKUP_REMOTE is set in .env, it also
# keeps an off-site copy with rclone: every uploaded file, plus 30 days of nightly
# database snapshots.
set -euo pipefail

cd "$(dirname "$0")/.."
setting() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/' || true; }
DATA=$(setting SQUIGGLE_DATA_DIR); DATA=${DATA:-$(pwd)/data}
DEST=$(setting BACKUP_DIR); DEST=${DEST:-$(pwd)/backups}
BACKUP_REMOTE=$(setting BACKUP_REMOTE)
KEEP_DAYS=$(setting BACKUP_KEEP_DAYS); KEEP_DAYS=${KEEP_DAYS:-14}
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
  # Off-site, uploaded files are stored once (they never change) and only the small database
  # snapshot is added each night, so the copy stays far smaller than the local archives.
  REMOTE_KEEP_DAYS=$(setting BACKUP_REMOTE_KEEP_DAYS); REMOTE_KEEP_DAYS=${REMOTE_KEEP_DAYS:-30}
  gzip -c "$DATA/.backup-snapshot.db" > "$DEST/.squiggle-$STAMP.db.gz"
  rclone copyto "$DEST/.squiggle-$STAMP.db.gz" "$BACKUP_REMOTE/db/squiggle-$STAMP.db.gz"
  rm -f "$DEST/.squiggle-$STAMP.db.gz"
  rclone copy "$DATA/uploads" "$BACKUP_REMOTE/uploads"
  rclone delete --min-age "${REMOTE_KEEP_DAYS}d" "$BACKUP_REMOTE/db"
  BYTES=$(rclone size --json "$BACKUP_REMOTE" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')
  echo "$(date -Is) copied off-site to $BACKUP_REMOTE (now $(( ${BYTES:-0} / 1048576 )) MB there)"
  if [ "${BYTES:-0}" -gt $(( 8 * 1073741824 )) ]; then
    echo "$(date -Is) WARNING: off-site backups are over 8 GB — close to the 10 GB free R2 allowance"
  fi
else
  echo "$(date -Is) WARNING: BACKUP_REMOTE is not set, so this backup exists only on this server"
fi
