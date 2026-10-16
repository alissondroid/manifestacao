#!/usr/bin/env bash
# Atualiza a Avenida Online na VPS: baixa o código, reconstrói e reinicia. Rode como root.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/avenida}"
APP_USER="${APP_USER:-avenida}"
BRANCH="${BRANCH:-main}"
cd "$APP_DIR"
export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new"
git config --global --get-all safe.directory | grep -qx "$APP_DIR" || git config --global --add safe.directory "$APP_DIR"
if [ -d .git ]; then
  git fetch origin "$BRANCH"
  # preencher-legal.sh edita arquivos versionados (termos/privacidade): guarda e devolve depois do pull
  STASHED=0
  if ! git diff --quiet HEAD --; then git stash push -q -m "avenida-update" && STASHED=1; fi
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
  if [ "$STASHED" = 1 ]; then
    git stash pop -q || { echo "Conflito ao devolver as edições locais (git stash list). Resolva e rode de novo."; exit 1; }
  fi
else
  echo "Sem Git: envie o código novo para $APP_DIR (rsync/scp) e rode este script de novo."
fi

# Sem executar scripts de instalação das dependências: este script roda como root.
npm ci --ignore-scripts
npm run build

# Código do site é do root (o serviço só lê); só a pasta de dados é do serviço. O .env fica legível só para o serviço.
mkdir -p data
find "$APP_DIR" -path "$APP_DIR/data" -prune -o -exec chown root:root {} + # sem tocar no banco enquanto o serviço roda
chown -R "$APP_USER":"$APP_USER" data
[ -f .env ] && { chown root:"$APP_USER" .env; chmod 640 .env; }
mkdir -p /var/backups/avenida && chmod 700 /var/backups/avenida

# Unidade do systemd (com sandbox) vinda do repositório; se mudou, instala e, se o site não subir, volta a anterior.
UNIT=/etc/systemd/system/avenida.service
UNIT_CHANGED=0
if [ -f deploy/avenida.service ]; then
  NEW="$(mktemp)"
  sed -e "s#@APP_DIR@#$APP_DIR#g" -e "s#@APP_USER@#$APP_USER#g" deploy/avenida.service > "$NEW"
  if ! cmp -s "$NEW" "$UNIT"; then
    [ -f "$UNIT" ] && cp "$UNIT" "$UNIT.bak"
    install -m 644 "$NEW" "$UNIT"
    systemctl daemon-reload
    UNIT_CHANGED=1
  fi
  rm -f "$NEW"
fi

systemctl restart avenida

# O deploy só é "ok" se o site responde.
healthy() { for _ in $(seq 1 20); do curl -fsS -m 3 http://127.0.0.1:8787/healthz >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }
if ! healthy; then
  echo "ERRO: o serviço não respondeu em /healthz."
  journalctl -u avenida -n 40 --no-pager || true
  if [ "$UNIT_CHANGED" = 1 ] && [ -f "$UNIT.bak" ]; then
    echo "Voltando a unidade anterior do systemd…"
    cp "$UNIT.bak" "$UNIT"
    systemctl daemon-reload
    systemctl restart avenida
    healthy && echo "Serviço voltou com a unidade anterior. Veja o log acima." || echo "O serviço continua fora do ar."
  fi
  exit 1
fi
systemctl --no-pager --lines=3 status avenida
