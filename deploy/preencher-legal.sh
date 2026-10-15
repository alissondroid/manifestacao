#!/usr/bin/env bash
# Preenche os campos destacados dos Termos e da Política de privacidade e reconstrói o site.
#   bash deploy/preencher-legal.sh "Fulano de Tal" "CPF 000.000.000-00" "São Paulo/SP" "contato@avenidaonline.com" "Hostinger"
set -euo pipefail
[ "$#" -eq 5 ] || { echo 'Uso: preencher-legal.sh "NOME OU RAZÃO SOCIAL" "CPF OU CNPJ" "CIDADE/UF" "E-MAIL" "PROVEDOR DE HOSPEDAGEM"'; exit 1; }
cd "$(dirname "$0")/.."
python3 - "$@" <<'PY'
import re, sys, html
nome, doc, cidade, email, host = [html.escape(a) for a in sys.argv[1:6]]
subs = [("nome completo ou razão social", nome), ("CPF ou CNPJ", doc), ("cidade/UF", cidade),
        ("e-mail de contato", f'<a href="mailto:{email}">{email}</a>'), ("provedor", host)]
for p in ("public/termos/index.html", "public/privacidade/index.html"):
    s = open(p, encoding="utf-8").read()
    for key, val in subs:
        s = re.sub(r"<mark>\[PREENCHER: " + re.escape(key) + r"[^\]]*\]</mark>", val, s)
    open(p, "w", encoding="utf-8").write(s)
    print(p, "- campos restantes:", s.count("PREENCHER"))
PY
npm run build
