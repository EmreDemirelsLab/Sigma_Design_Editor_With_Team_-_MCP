#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
out="backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$out"
# Stop writers for a consistent DB + asset snapshot. Frontend remains available but writes fail briefly.
services=(penpot-backend penpot-exporter sigma-assistant penpot-admin-console)
trap 'docker compose start "${services[@]}" >/dev/null' EXIT
docker compose stop "${services[@]}"
docker compose exec -T penpot-postgres pg_dump -U penpot -d penpot -Fc > "$out/database.dump"
docker compose run --rm --no-deps -T --entrypoint tar penpot-backend -C /opt/data/assets -czf - . > "$out/assets.tar.gz"
cp .env "$out/environment.env"
sha256sum "$out/database.dump" "$out/assets.tar.gz" > "$out/SHA256SUMS"
printf 'Backup created: %s\n' "$out"
