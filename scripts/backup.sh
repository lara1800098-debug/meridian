#!/usr/bin/env bash
# Daily backup: compressed pg_dump + uploaded files. Schedule with cron, e.g.  15 2 * * *  cd /opt/meridian && npm run backup
# Restore: gunzip -c backups/meridian-YYYYMMDD.sql.gz | psql "$DATABASE_URL"  &&  tar xzf backups/uploads-YYYYMMDD.tgz
set -euo pipefail
DIR="${BACKUP_DIR:-./backups}"; mkdir -p "$DIR"; STAMP=$(date +%Y%m%d-%H%M)
pg_dump --no-owner "${DATABASE_URL:?set DATABASE_URL}" | gzip > "$DIR/meridian-$STAMP.sql.gz"
[ -d "${UPLOAD_DIR:-./uploads}" ] && tar czf "$DIR/uploads-$STAMP.tgz" -C "$(dirname "${UPLOAD_DIR:-./uploads}")" "$(basename "${UPLOAD_DIR:-./uploads}")" || true
# Optional encryption at rest for off-box copies:  gpg --symmetric --cipher-algo AES256 "$DIR/meridian-$STAMP.sql.gz"
find "$DIR" -type f -mtime +"${BACKUP_KEEP_DAYS:-30}" -delete
echo "✔ backup written to $DIR ($STAMP)"
