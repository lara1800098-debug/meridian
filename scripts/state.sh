#!/usr/bin/env bash
# Persist Meridian's intelligence data (sources, articles, organisations, signals, plays) between runs on fresh machines.
#   bash scripts/state.sh save     -> data/state.sql.gz   (no users, sessions or secrets are included)
#   bash scripts/state.sh restore  -> loads it into an empty database, then applies defaults
set -euo pipefail
DB="${DATABASE_URL:-postgres://meridian:meridian@localhost:5432/meridian}"
F="${STATE_FILE:-data/state.sql.gz}"
TABLES=(sources snapshots organisations org_notes people signals signal_sources offers plays play_outcomes competitors settings stages fx_rates rate_cards events)
case "${1:-}" in
  save)
    args=(); for t in "${TABLES[@]}"; do args+=(-t "$t"); done
    pg_dump --data-only --no-owner "${args[@]}" "$DB" 2>/dev/null | gzip -9 > "$F"
    echo "✔ state saved to $F ($(du -h "$F" | cut -f1))" ;;
  restore)
    psql -q "$DB" -f src/db/schema.sql >/dev/null
    if [ -f "$F" ]; then
      psql -q "$DB" -c "TRUNCATE $(IFS=,; echo "${TABLES[*]}") CASCADE" >/dev/null
      { echo "SET session_replication_role = replica;"; gunzip -c "$F"; echo "SET session_replication_role = DEFAULT;"; } | psql -q -v ON_ERROR_STOP=1 "$DB" >/dev/null
      # Users are never stored in the state file: drop links to accounts that do not exist on this machine.
      psql -q "$DB" -c "UPDATE plays SET owner_id = NULL WHERE owner_id IS NOT NULL AND owner_id NOT IN (SELECT id FROM users); UPDATE snapshots SET added_by = NULL WHERE added_by IS NOT NULL AND added_by NOT IN (SELECT id FROM users); DELETE FROM org_notes WHERE user_id NOT IN (SELECT id FROM users); UPDATE plays SET deal_id = NULL WHERE deal_id IS NOT NULL AND deal_id NOT IN (SELECT id FROM deals);" >/dev/null
      echo "✔ state restored from $F"
    else echo "no state file — starting fresh"; fi
    npm run -s db:migrate ;;
  *) echo "usage: state.sh save|restore"; exit 1 ;;
esac
