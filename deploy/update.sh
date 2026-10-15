#!/usr/bin/env bash
# Atualiza a Avenida Online na VPS: baixa o código, reconstrói e reinicia. Rode como root.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/avenida}"
BRANCH="${BRANCH:-main}"
cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
npm ci
npm run build
chown -R avenida:avenida "$APP_DIR"
systemctl restart avenida
systemctl --no-pager --lines=3 status avenida
