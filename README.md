# Avenida Online

[![CI](https://github.com/alissondroid/avenida-online/actions/workflows/ci.yml/badge.svg)](https://github.com/alissondroid/avenida-online/actions/workflows/ci.yml) ![License: MIT](https://img.shields.io/badge/license-MIT-green) ![Node >=22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)

Mundo 3D multiplayer no navegador, ambientado na Avenida Paulista: escolha um lado, monte seu personagem, converse, dance e jogue com outras pessoas em tempo real.

![Avenida Online](public/og-image.png)

**Stack:** three.js (cliente), Vite, servidor Node 22 com `ws` e SQLite embutido (`node:sqlite`). Sem build de TypeScript, sem banco externo.

## Início rápido

```bash
npm install
npm run dev     # servidor WebSocket (8787) + Vite em http://localhost:5180
npm test
```

Produção (um processo serve o build e o WebSocket):

```bash
npm run build && npm start   # http://localhost:8787
```

Configuração em `.env` (copie de `.env.example`; use só chaves de teste de pagamento).

## Documentação

- [Documentação completa](docs/DOCUMENTACAO.md): arquitetura, protocolo, deploy em VPS, loja, moderação, segurança
- [Contribuir](CONTRIBUTING.md) · [Segurança](SECURITY.md) · [Código de conduta](CODE_OF_CONDUCT.md)
- [Licenças de terceiros](ASSETS.md) · [Changelog](CHANGELOG.md)

## Fork

- Troque `avenidaonline.com` pelo seu domínio (`grep -rl avenidaonline.com index.html votacao public server src deploy docs`) e preencha `public/termos` e `public/privacidade` (campos `[PREENCHER]`).
- O jogo traz dois corpos (masculino Ready Player Me, feminino Quaternius CC0). Adicione corpos com licença livre: veja "Modelos 3D" na documentação.

## Aviso

Projeto independente, sem vínculo com candidatos, partidos ou campanhas. Os nomes e números identificam apenas os lados da disputa. Revise a legislação eleitoral e os termos de uso antes de publicar uma instância.

## Licença

Código sob [MIT](LICENSE). Modelos e animações de terceiros têm licenças próprias: [ASSETS.md](ASSETS.md).
