#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/preflight.py
docker compose config --quiet
docker compose up -d --build
