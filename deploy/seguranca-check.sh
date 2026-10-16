#!/usr/bin/env bash
# Confere a segurança da VPS sem alterar nada (só leitura). Rode como root:  bash /opt/avenida/deploy/seguranca-check.sh
APP_DIR="${APP_DIR:-/opt/avenida}"
APP_USER="${APP_USER:-avenida}"
ok=0; warn=0
good() { printf '  \033[32m✔\033[0m %s\n' "$1"; ok=$((ok + 1)); }
bad()  { printf '  \033[33m!\033[0m %s\n' "$1"; warn=$((warn + 1)); }
env_get() { grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2-; }

echo "== Segredos e permissões =="
if [ -f "$APP_DIR/.env" ]; then
  perm=$(stat -c %a "$APP_DIR/.env")
  case "$perm" in 600|640|400|440) good ".env com permissão $perm (sem acesso para outros usuários)";; *) bad ".env com permissão $perm: rode chmod 640 $APP_DIR/.env";; esac
else bad ".env não encontrado em $APP_DIR"; fi
[ "$(stat -c %U "$APP_DIR/server/index.js" 2>/dev/null)" = "$APP_USER" ] && bad "o código pertence ao usuário do serviço ($APP_USER): se o serviço for invadido ele reescreve o código (rode deploy/update.sh)" || good "o código não pertence ao usuário do serviço"
[ "$(stat -c %U "$APP_DIR/data" 2>/dev/null)" = "$APP_USER" ] && good "pasta de dados pertence ao serviço" || bad "pasta data/ não pertence a $APP_USER"
perm=$(stat -c %a /var/backups/avenida 2>/dev/null); [ "$perm" = 700 ] && good "backups só legíveis pelo root" || bad "/var/backups/avenida com permissão ${perm:-inexistente} (use 700)"
last=$(find /var/backups/avenida -name 'avenida-*.db' -mtime -2 2>/dev/null | head -1); [ -n "$last" ] && good "há backup do banco das últimas 48 h" || bad "nenhum backup recente em /var/backups/avenida (copie também para fora da VPS)"

echo "== Configuração do jogo (.env) =="
[ "$(env_get TRUST_PROXY)" = 1 ] && good "TRUST_PROXY=1 (IP real vem do Caddy)" || bad "TRUST_PROXY não é 1: todos os jogadores parecem ter o mesmo IP"
case "$(env_get PUBLIC_URL)" in https://*) good "PUBLIC_URL usa https";; *) bad "PUBLIC_URL não é https://… (WebSocket e HSTS dependem dele)";; esac
[ -n "$(env_get ADMIN_TOKEN)" ] && { [ "$(env_get ADMIN_TOKEN | wc -c)" -gt 24 ] && good "ADMIN_TOKEN definido e longo" || bad "ADMIN_TOKEN curto (use openssl rand -hex 24)"; } || good "API de administração desligada (sem ADMIN_TOKEN)"
[ "$(env_get ALLOW_SIMULATED)" = 1 ] && bad "ALLOW_SIMULATED=1: a loja entrega itens SEM cobrar. Remova em produção." || good "loja simulada desligada"
[ -n "$(env_get ABACATEPAY_API_KEY)" ] && good "chave da AbacatePay definida" || bad "sem ABACATEPAY_API_KEY: a loja fica desligada"
[ -n "$(env_get ABACATEPAY_API_KEY)" ] && { [ -n "$(env_get ABACATEPAY_WEBHOOK_SECRET)" ] && good "segredo do webhook definido" || bad "sem ABACATEPAY_WEBHOOK_SECRET: o item só libera com a consulta de leitura da chave"; }

echo "== Serviço =="
systemctl is-active --quiet avenida && good "serviço avenida rodando" || bad "serviço avenida parado"
if command -v systemd-analyze >/dev/null; then
  score=$(systemd-analyze security avenida --no-pager 2>/dev/null | tail -1)
  echo "    $score  (quanto menor a nota, melhor; abaixo de 5 é bom)"
fi
curl -fsS -m 5 http://127.0.0.1:8787/healthz >/dev/null && good "/healthz responde" || bad "/healthz não responde"
dom=$(env_get PUBLIC_URL)
if [ -n "$dom" ]; then
  h=$(curl -sI -m 8 "$dom/" 2>/dev/null)
  echo "$h" | grep -qi "^strict-transport-security" && good "HSTS ativo" || bad "sem Strict-Transport-Security"
  echo "$h" | grep -qi "^content-security-policy" && good "Content-Security-Policy ativa" || bad "sem Content-Security-Policy"
fi

echo "== Sistema =="
if command -v sshd >/dev/null; then
  eff=$(sshd -T 2>/dev/null)
  echo "$eff" | grep -qi "^passwordauthentication no" && good "SSH sem senha (só chave)" || bad "SSH aceita senha: ponha PasswordAuthentication no em /etc/ssh/sshd_config.d/ (depois de confirmar que sua chave entra)"
  echo "$eff" | grep -qiE "^permitrootlogin (no|prohibit-password|without-password)" && good "login root por senha desativado" || bad "root pode entrar por senha no SSH"
fi
ufw status 2>/dev/null | grep -q "Status: active" && good "firewall ufw ativo" || bad "firewall ufw inativo"
systemctl is-active --quiet fail2ban 2>/dev/null && good "fail2ban ativo (bloqueia força bruta no SSH)" || bad "fail2ban não instalado/ativo: apt install fail2ban"
dpkg -s unattended-upgrades >/dev/null 2>&1 && good "atualizações de segurança automáticas" || bad "sem unattended-upgrades: apt install unattended-upgrades"
n=$(apt list --upgradable 2>/dev/null | grep -c -i security); [ "$n" = 0 ] && good "nenhuma atualização de segurança pendente" || bad "$n atualização(ões) de segurança pendente(s): apt upgrade"
[ -f /var/run/reboot-required ] && bad "o servidor pede reinício (kernel atualizado)" || good "sem reinício pendente"

echo
echo "Resumo: $ok ok, $warn atenção."
[ "$warn" = 0 ]
