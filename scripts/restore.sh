#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# -ne 2 || "$2" != "--confirm-replace-data" ]]; then
  echo 'Usage: bash scripts/restore.sh backups/TIMESTAMP --confirm-replace-data'
  echo 'This replaces the current database and design assets.'
  exit 1
fi
src="$1"
test -s "$src/database.dump"
test -s "$src/assets.tar.gz"
sha256sum -c "$src/SHA256SUMS"
# Set .env to match the backup version and secret key before restoring.
services=(penpot-backend penpot-exporter sigma-assistant penpot-admin-console)
# On failure, leave writers stopped; do not start against a half-restored database.
docker compose stop "${services[@]}"
docker compose exec -T penpot-postgres dropdb --force -U penpot --if-exists penpot
docker compose exec -T penpot-postgres createdb -U penpot penpot
docker compose exec -T penpot-postgres pg_restore -U penpot -d penpot --exit-on-error < "$src/database.dump"
docker compose run --rm --no-deps -T --entrypoint sh penpot-backend -c 'find /opt/data/assets -mindepth 1 -delete; tar -xzf - -C /opt/data/assets' < "$src/assets.tar.gz"
docker compose start "${services[@]}"
echo 'Restored. Verify accounts and design files.'
