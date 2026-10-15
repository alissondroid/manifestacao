#!/usr/bin/env bash
# Atualiza a Avenida Online na VPS: baixa o código, reconstrói e reinicia. Rode como root.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/avenida}"
BRANCH="${BRANCH:-main}"
cd "$APP_DIR"
export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new"
git config --global --get-all safe.directory | grep -qx "$APP_DIR" || git config --global --add safe.directory "$APP_DIR"
if [ -d .git ]; then
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  echo "Sem Git: envie o código novo para $APP_DIR (rsync/scp) e rode este script de novo."
fi
npm ci
npm run build
chown -R avenida:avenida "$APP_DIR"
systemctl restart avenida
systemctl --no-pager --lines=3 status avenida
