#!/usr/bin/env bash
# Instala e configura a Avenida Online numa VPS Ubuntu 22.04/24.04 (rode como root). Pode rodar de novo sem estragar nada.
#
#   DOMAIN=seu-dominio.com bash deploy/setup.sh      # com HTTPS automático (o DNS já deve apontar para esta VPS)
#   bash deploy/setup.sh                              # sem domínio: HTTP no IP (só para testar)
#
# Variáveis opcionais: BRANCH (padrão: main), REPO_URL (HTTPS ou git@github.com:... com chave de deploy), APP_DIR (padrão: /opt/avenida).
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Rode como root."; exit 1; }

APP_DIR="${APP_DIR:-/opt/avenida}"
REPO_URL="${REPO_URL:-https://github.com/alissondroid/manifestacao.git}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-}"
APP_USER=avenida
export DEBIAN_FRONTEND=noninteractive

echo "==> Pacotes base"
apt-get update -y
apt-get install -y curl git ufw sqlite3 ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

echo "==> Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> Caddy (HTTPS automático)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> Usuário e código"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new"
git config --global --get-all safe.directory | grep -qx "$APP_DIR" || git config --global --add safe.directory "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
elif [ -f "$APP_DIR/package.json" ]; then
  echo "Código já está em $APP_DIR (sem Git): usando como está."
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

echo "==> Dependências e build"
npm ci --ignore-scripts # sem rodar scripts das dependências (este script é root)
npm run build
mkdir -p data
# código é do root (o serviço só lê); só a pasta de dados é do serviço
find "$APP_DIR" -path "$APP_DIR/data" -prune -o -exec chown root:root {} +
chown -R "$APP_USER":"$APP_USER" "$APP_DIR/data"

echo "==> .env"
if [ ! -f .env ]; then
  cp .env.example .env
  if [ -n "$DOMAIN" ]; then echo "PUBLIC_URL=https://$DOMAIN" >> .env; fi
  {
    echo "TRUST_PROXY=1"
    echo "MAX_PLAYERS=300"
  } >> .env
fi
chmod 640 .env
chown root:"$APP_USER" .env

echo "==> Serviço systemd (com sandbox)"
sed -e "s#@APP_DIR@#$APP_DIR#g" -e "s#@APP_USER@#$APP_USER#g" "$APP_DIR/deploy/avenida.service" > /etc/systemd/system/avenida.service
systemctl daemon-reload
systemctl enable --now avenida
systemctl restart avenida

echo "==> Caddy"
if [ -n "$DOMAIN" ]; then SITE="$DOMAIN"; else SITE=":80"; fi
cat > /etc/caddy/Caddyfile <<CADDY
$SITE {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8787
}
CADDY
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

echo "==> Firewall (SSH, HTTP, HTTPS)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Backup diário do banco (14 dias)"
mkdir -p /var/backups/avenida
chmod 700 /var/backups/avenida # os backups têm e-mails e hashes de senha
cat > /etc/cron.daily/avenida-backup <<'CRON'
#!/bin/sh
f=/var/backups/avenida/avenida-$(date +%F).db
[ -f /opt/avenida/data/avenida.db ] && sqlite3 /opt/avenida/data/avenida.db ".backup '$f'"
find /var/backups/avenida -name 'avenida-*.db' -mtime +14 -delete
CRON
chmod +x /etc/cron.daily/avenida-backup

sleep 2
echo
systemctl --no-pager --lines=5 status avenida || true
IP=$(curl -fsS https://api.ipify.org || hostname -I | cut -d' ' -f1)
if [ -n "$DOMAIN" ]; then echo "Pronto: https://$DOMAIN  (o DNS de $DOMAIN precisa apontar para $IP)"; else echo "Pronto: http://$IP"; fi
echo "Logs: journalctl -u avenida -f   ·   Atualizar: bash $APP_DIR/deploy/update.sh"
