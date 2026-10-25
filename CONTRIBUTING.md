# Contribuindo

1. Abra uma issue antes de mudanças grandes.
2. Fork, branch a partir da `main`, um assunto por PR.
3. Requisitos: Node 22+.

```bash
npm install
npm run dev
npm run lint  # ESLint, sem erros
npm test      # deve passar antes do PR
npm run build
```

## Regras

- Sem dependências novas sem justificativa (o projeto é enxuto de propósito).
- Regras de jogo e validação ficam no **servidor**; o cliente nunca é confiável.
- Mantenha o estilo do código vizinho (ESM, sem TypeScript, comentários só quando necessários).
- Mudou comportamento? Adicione ou ajuste um teste em `test/`.
- Nunca commite `.env`, chaves, banco (`data/`) ou modelos fonte (`assets-src/`).
- Não envie modelos 3D, imagens ou sons sem licença compatível; informe a origem e a licença no PR e em `ASSETS.md`.
- Vulnerabilidades: não abra issue pública, veja `SECURITY.md`.

Ao contribuir, você concorda que sua contribuição é licenciada sob a MIT (`LICENSE`).
