# Avenida Online · Eleições 2026 na Paulista

Manifestação online na Avenida Paulista, direto no navegador. Você escolhe o lado (**Petista** (13), **Bolsonarista** (22), **Anarquistas** ou **Sem partido**), monta um personagem brasileiro, leva bandeira ou cartaz e conversa com os outros jogadores em tempo real. MVP inspirado na arquitetura do manifestacao.com, com arte própria.

[![CI](https://github.com/alissondroid/avenida-online/actions/workflows/ci.yml/badge.svg)](https://github.com/alissondroid/avenida-online/actions/workflows/ci.yml) ![License: MIT](https://img.shields.io/badge/license-MIT-green) ![Node >=22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)

Código aberto sob licença **MIT**. Modelos 3D e outros arquivos de terceiros têm licenças próprias: veja [`ASSETS.md`](../ASSETS.md). Contribuições: [`CONTRIBUTING.md`](../CONTRIBUTING.md). Segurança: [`SECURITY.md`](../SECURITY.md).

**Aviso jurídico:** projeto independente, sem vínculo com candidatos, partidos ou campanhas. Os nomes e números identificam apenas os lados da disputa. O projeto não inclui personagens com a aparência de pessoas reais. Antes de publicar uma instância, revise a legislação eleitoral (propaganda, uso de nome de candidato e monetização em período eleitoral) e os termos de uso.

## Rodar

```bash
npm install
npm run dev      # servidor WebSocket (8787) + Vite (http://localhost:5180)
```

Testes (`node --test`, sem dependências extras; o servidor de teste usa banco em memória):

```bash
npm test         # regras do jogo, conta/itens e servidor real via WebSocket
```

`GET /healthz` responde `{ok, players, uptime}` (para monitoramento). O servidor trata `SIGTERM`/`SIGINT` fechando as conexões e o banco.

Produção (um único processo serve o build e o WebSocket):

```bash
npm run build
npm start        # http://localhost:8787
```

Variáveis do servidor (arquivo `.env`, veja `.env.example`): `PORT`, `MAX_PLAYERS` (300), `MAX_PER_IP` (5), `AOI` (raio de interesse em metros, 70), `BLOCKED_WORDS` (lista separada por vírgula para mascarar no chat), `DB_PATH` (padrão `data/avenida.db`), `PUBLIC_URL` (URL pública, usada para validar a origem do WebSocket; defina em produção), `GOOGLE_CLIENT_ID` (login com Google, opcional), `TRUST_PROXY`, `ADMIN_TOKEN`, `SHOW_TIMES`.

## Estrutura

| Pasta | O que tem |
|---|---|
| `shared/config.js` | Constantes usadas pelo cliente e pelo servidor (mundo, cores, limites) |
| `server/index.js` | Servidor `ws`: entrada, validação de movimento, chat com cooldown, contagem online |
| `src/world.js` | Avenida Paulista estilizada: pista com faixas de ônibus e faixa dupla amarela, calçada de mosaico, prédios com térreo comercial, MASP, Parque Trianon, ônibus e carros com faróis, carros de som cercados por grades, lixeiras, bueiros, placas "Av. Paulista" e lambe-lambes dos quatro lados; sol com sombras que acompanham o jogador |
| `src/sky.js` | Céu em shader (degradê + sol), nuvens e mapa de ambiente para os vidros |
| `src/textures.js` | Todas as texturas, desenhadas em canvas: asfalto e mosaico (com normal maps gerados de mapas de altura), fachadas, rostos, bandeiras (Brasil, Petista 13, Bolsonarista 22, anarquista, sem partido), estampas de camisa, cartazes, faixas, placas, lambes e o telão animado com letreiro e contagem de pessoas |
| `src/aging.js` | Idosos: sem gorro e barba grisalha no homem, pele mais pálida, óculos de leitura, tronco curvado, bengala na mão direita e passo mais lento (não há modelos de idosos; são os mesmos corpos envelhecidos) |
| `src/crowd.js` | Multidão de 110 figurantes com os mesmos modelos humanos (20% idosos) (cada um com seu esqueleto e animação; quem está a mais de 55 m anima a 1/3 da taxa), agrupada por lado com as cores de camisa de cada um |
| `src/models.js` | Carrega os modelos humanos glTF (`public/models`), retargeta as animações para o corpo e clona personagens com materiais próprios |
| `src/avatar.js` | Avatar com modelo humano real animado por `AnimationMixer` (parado, andando, correndo, dançando; aceno por cinemática nos ossos do braço). Os personagens comuns vestem camiseta e bermuda com cores à escolha (o Rosto 1 masculino também troca pele e barba); Lula, Renan e Bolsonaro ficam com a roupa original e não trocam de roupa; todos aceitam a opção Idoso; acessórios, bandeira e cartaz seguem os ossos |
| `server/db.js` | SQLite embutido do Node (`node:sqlite`): usuários, sessões, itens equipados e desenhos |
| `server/auth.js` | Senhas com scrypt, sessões por cookie HttpOnly, limite de tentativas, validações |
| `server/api.js` | Rotas HTTP: conta, itens equipados e desenhos, administração |
| `server/items.js` | Itens equipados e desenhos personalizados (todo item do catálogo é grátis) |
| `src/account.js` | Login/cadastro e tela "Meu visual" (modais) |
| `src/api.js` | Cliente da API HTTP |
| `src/net.js` | Cliente WebSocket com reconexão (reenvia `join` ou `watch`) |
| `src/audio.js` | Som ambiente sintetizado (multidão, buzinas distantes, pop de chat), sem arquivos |
| `src/ui.js` | Lobby, HUD, chat, joystick de toque e rótulos flutuantes |
| `src/portraits.js` | Personagens prontos (Homem e Mulher) e os retratos deles, renderizados do modelo 3D num render target |
| `src/main.js` | Loop do jogo, câmera, controles, interpolação dos outros jogadores |

## Protocolo (JSON sobre WebSocket, `/ws`)

Cliente → servidor: `join {nick, side, look}`, `watch` (espectador), `move {x, z, ry, a}`, `chat {text}`, `report {id}` (denunciar um jogador).

Servidor → cliente: `online {counts}`, `welcome {id, x, z}`, `sync {add, del, s}` (10 Hz), `chat {id, nick, side, text}`, `look {id, look}` (itens equipados mudaram), `denied {reason}` (entrada recusada), `fix {x, z}`.

`sync` é o interesse por área: cada cliente só recebe `add` (jogador entrou no raio, com visual completo), `del` (saiu do raio ou da avenida) e `s` (posições que mudaram, `[id, x, z, ry, anim]`). A saída do raio tem histerese de 10 m para não piscar. Espectadores recebem todos.

Fechamentos que o servidor faz de propósito usam códigos próprios, e o cliente (`src/net.js`) **não reconecta** nesses casos, só mostra o motivo: `4000` entrou em outro lugar (outra aba ou aparelho com a mesma conta), `4001` conta excluída, `4003` banido. Qualquer outro fechamento (queda de rede, reinício do servidor com `1001`) reconecta sozinho com espera exponencial (até 8 s) e jitter, para os jogadores não voltarem todos juntos. `reconnect()` (por exemplo, depois de entrar na conta) volta a conectar mesmo depois de um fechamento intencional.

O servidor limita a velocidade com um orçamento de deslocamento (`spendMoveBudget` em `server/rules.js`: acumula `limite × tempo real × 1,25`, com teto, e gasta a distância andada; mandar muitas mensagens curtas não aumenta a velocidade), recorta a posição ao mapa, sanitiza textos e aplica cooldown de chat. Tempos de corrida abaixo do mínimo físico não entram no ranking.

## Hospedagem (VPS Ubuntu)

Precisa de um processo Node 22+ sempre ligado, com WebSocket e disco (não serve Vercel/serverless nem hospedagem compartilhada). Na VPS, como root:

```bash
apt-get update && apt-get install -y git
git clone -b main https://github.com/alissondroid/avenida-online.git /opt/avenida   # repositório privado: use um token na URL
DOMAIN=seu-dominio.com BRANCH=main bash /opt/avenida/deploy/setup.sh               # sem DOMAIN: HTTP no IP, só para testar
```

O script instala Node 22 e Caddy (HTTPS automático), faz o build, cria o serviço `systemd` `avenida` (usuário sem login, reinício automático), o `.env`, o firewall (22, 80 e 443) e um backup diário do SQLite em `/var/backups/avenida` (14 dias). Depois edite `/opt/avenida/.env` (por exemplo `GOOGLE_CLIENT_ID`) e rode `systemctl restart avenida`. Para atualizar: `bash /opt/avenida/deploy/update.sh`. **Deploy automático:** `.github/workflows/deploy.yml` roda os testes e o build a cada push na `main` e, se passarem, entra na VPS por SSH e roda o `update.sh`. Configure em Settings → Secrets and variables → Actions: `VPS_HOST` (IP ou domínio), `VPS_SSH_KEY` (chave privada; a pública vai em `~/.ssh/authorized_keys` da VPS), e opcionalmente `VPS_USER` (padrão `root`) e `VPS_PORT` (padrão 22). Também dá para disparar à mão em Actions → Deploy → Run workflow. Logs: `journalctl -u avenida -f`.

## Termos, privacidade e LGPD

`/termos` e `/privacidade` (páginas estáticas em `public/termos` e `public/privacidade`) são **modelos para revisão com um advogado**: os campos destacados em amarelo precisam ser preenchidos (nome/razão social, CPF/CNPJ, cidade, e-mail de contato, provedor). Na VPS: `bash /opt/avenida/deploy/preencher-legal.sh "NOME" "CPF/CNPJ" "CIDADE/UF" "EMAIL" "Hostinger"` e depois `systemctl restart avenida`. O cadastro exige o aceite (`terms: true`, gravado em `users.terms_at`) e o botão "Excluir conta" (`POST /api/auth/delete`, pede a senha) apaga e-mail, senha, itens, desenhos, sessões e recordes, anonimiza o usuário e mantém só os pedidos pagos (obrigação fiscal). **Login com Google** (opcional): em console.cloud.google.com → APIs e serviços → Credenciais, crie um *ID do cliente OAuth* do tipo *Aplicativo da Web*, adicione o domínio do site (`https://seu-dominio.com`) em *Origens JavaScript autorizadas* e ponha o ID em `GOOGLE_CLIENT_ID` no `.env` da VPS (depois `systemctl restart avenida`). Sem a variável o botão não aparece. O servidor valida o ID token com as chaves públicas do Google (`server/google.js`, RS256, `aud`, `iss`, `exp`, e-mail verificado) e a CSP só libera `accounts.google.com/gsi` quando o login está ativo. Quem entra pela primeira vez escolhe apelido e aceita os Termos; se já existir conta com o mesmo e-mail, ela é vinculada ao Google e a senha antiga deixa de valer (o e-mail do cadastro por senha nunca foi confirmado). Conta do Google exclui digitando `EXCLUIR`. O Google passa a ser um terceiro: mencione-o na Política de privacidade. Se passar a usar analytics, anúncios ou cookies de terceiros, atualize a política e adicione um aviso de cookies.

## SEO e identidade

`index.html` traz título, descrição, canonical (`https://avenidaonline.com/`), Open Graph e Twitter Card (`public/og-image.png`, 1200×630), JSON-LD (`WebSite` e `VideoGame`) e um `<noscript>` com texto. Em `public/`: `favicon.svg`, `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest` (instalável como app), `robots.txt` (bloqueia `/api/` e `/pagar/`) e `sitemap.xml` (inclui `/termos` e `/privacidade`). O servidor responde 404 de verdade para caminhos inexistentes e define cache (HTML sem cache, `assets/` imutáveis). Se o domínio mudar, troque `avenidaonline.com` em `index.html`, `robots.txt` e `sitemap.xml`. Depois de publicar, cadastre o site no Google Search Console e envie o `sitemap.xml`.

## Contas e itens de visual

- **Conta:** e-mail, apelido único e senha (mín. 8). A sessão fica num cookie `HttpOnly; SameSite=Lax` (30 dias), no banco só o hash do token. Quem tem conta joga com o apelido dela; convidados continuam sem cadastro, mas não podem usar o apelido de uma conta.
- **Itens:** o catálogo (`SHOP` em `shared/config.js`) é grátis: camisas, bonés e chapéus, óculos, mochila, capa, asas, auras, selos, carros e os itens personalizáveis (cartaz, bandeira e camisa). Quem tem conta equipa um item por slot em "Meu visual" (`POST /api/items/equip`, validado no servidor). O jogo não tem compras nem pagamentos. Nada aqui dá vantagem no PvP.

## Modelos 3D e créditos

Os corpos incluídos são `public/models/readyplayer.me.glb` (masculino; avatar de exemplo do Ready Player Me, do repositório de exemplos do three.js) e `public/models/ubc_female.glb` (feminino; Quaternius, CC0, gerado de um FBX por `node scripts/converter-ubc.mjs assets-src/ubc-female.fbx public/models/ubc_female.glb`, com a roupa pintada por região de ossos). Os personagens mudam de roupa, pele, cabelo e barba em `src/models.js`. As animações vêm de `ual1.glb`/`ual2.glb` (Quaternius, CC0) e `zsky.glb` (Zsky, CC BY 4.0), todas no esqueleto padrão do Mixamo, com retarget próprio (`directClip`).

Para adicionar um corpo seu (glTF com esqueleto `mixamorig…`, licença que permita redistribuir): coloque o arquivo em `public/models`, registre em `CHARACTERS` (`src/models.js`) e em `MODELS` (`shared/config.js`). Veja `ASSETS.md`. O repositório não inclui modelos de pessoas reais nem arquivos do Mixamo.

## Modos extras

- **Corrida** (botão 🏁 no HUD): quem entra espera até 15 s por outros corredores, é levado à linha de largada (pórtico em z = −100), conta 3-2-1 e corre até a chegada (z = +100). O servidor marca o tempo pela posição que já valida; resultado da prova e os 10 melhores tempos ficam em `race_times` (SQLite, `GET /api/race/top`). Mensagens `race {action}` do cliente e `race {state, n, startsIn, results, top}` do servidor.
- **PvP, a tomatada** (botão 🍅, tecla F para arremessar): só entre quem ligou o PvP. O servidor resolve o acerto pela posição e direção de quem arremessa (alcance 18 m, raio 0,9 m, 1 arremesso a cada 1,2 s) e manda `throw` para quem está perto (o cliente anima o tomate) e `hitby` para o atingido. Placar por lado e os 5 maiores acertadores em `pvp {scores, top}`.

## Simulador de votação (`/votacao`)

Segundo modo do site, educativo e **não oficial**: sair de casa com o documento, andar até a Escola Municipal Esperança, enfrentar a fila, achar a seção, passar pelos mesários (documento + biometria) e votar na urna (Deputado Federal 4 dígitos, Senador 3, Governador 2, Presidente 2). Candidatos e partidos são **fictícios**; nenhum voto é enviado ou guardado (a urna roda só no navegador). Detalhes:

- `shared/votacao.js`: mapa, etapas, retângulos por etapa (impedem pular etapas, usados no cliente e no servidor), candidatos fictícios e a máquina da urna.
- `server/votacao.js`: sala própria na mesma conexão (`vjoin`, `move`, `act`, `chat`); o servidor só guarda a etapa do jogador. A fila é de verdade: NPCs e jogadores, anda a cada `VOTO_QUEUE_MS` (6 s). Variáveis de teste: `VOTO_SPEED`, `VOTO_QUEUE_MS`, `VOTO_MIN_VOTE_MS`, `VOTO_BIOMETRIA_MS`, `VOTO_MAX_PLAYERS`.
- `src/votacao/`: cenário 3D (`world.js`), figurantes leves, urna na tela (`urna.js`) e o jogo (`main.js`). Página: `votacao/index.html` (build com dois pontos de entrada).
- Comprovante simulado ("Eu votei!") para baixar ou compartilhar.

## Convites e fogos

- **Convite:** o botão 📣 gera um link com o seu lado (`?lado=…&src=convite`) para compartilhar. Não há recompensa nem contagem de convites.
- **Shows de fogos** (`server/shows.js`): 12:00 e 20:00 de Brasília (`SHOW_TIMES` muda ou, vazio, desliga), com aviso 5 e 1 minuto antes. `POST /api/admin/show` (token de admin) dispara um na hora.
- **Fogos do jogador:** botão 🎆 ou `/fogos` (grátis, a cada 10 s).

## Editar personagem em jogo

O botão 🎨 Personagem (HUD) abre o mesmo menu do lobby como editor, sem sair da avenida: o personagem fica parado, sem a etapa do lado nem o apelido. "Salvar alterações" envia `setlook`; o servidor revalida tudo com `cleanLook` (limite de 1 mensagem a cada 500 ms) e retransmite `look` a quem o vê. "Cancelar" restaura o visual anterior. Não abre dirigindo, nocauteado ou em corrida.

## Cartaz e bandeira personalizados

Itens "Seu cartaz", "Sua bandeira" e "Sua camisa": o botão ✏️ Editar em "Meu visual" abre o editor: texto (40 ou 16 caracteres), cor de fundo e do texto (paleta fixa) e um símbolo. O desenho é validado e salvo no servidor (`POST /api/shop/design`, tabela `designs`), passa pelo filtro de palavras e viaja para os outros jogadores dentro de `look.custom`. O cartaz grátis só aceita frases prontas (`SIGN_PRESETS` em `shared/config.js`, validadas no servidor): texto livre exige o item pago. O cartaz personalizado substitui o cartaz grátis quando "Cartaz" está na mão; a bandeira personalizada substitui a do lado quando "Bandeira do candidato" está na mão.

## Lobby

Layout no espírito do manifestacao.com: barra no topo com logo e online por lado; à esquerda o personagem em 3D com o chamado "Entre na Paulista. Do seu jeito." e as abas de animação (parado, andando, correndo, acenando, dançando; arraste para girar); à direita o menu **"Monte seu personagem"**, em quatro etapas:

1. **Lado**: Petista (13), Bolsonarista (22), Anarquistas ou Sem partido, com o contador de online de cada um.
2. **Personagem**: dois personagens prontos numa fila (Homem e Mulher) com retratos do modelo 3D e o botão 🎲 Sortear. Idosos e demais variações ficam em Visual.
3. **Visual**: corpo, idade, rosto e altura; pele, barba, camisa e calça só aparecem no rosto que aceita tingir (o texto explica quando não).
4. **Na mão**: nada, bandeira do Brasil, bandeira do lado, cartaz (frase pronta ou texto próprio), picanha no espeto ou abóbora. No PvP, quem segura picanha ou abóbora arremessa o próprio item em vez do tomate.

O rodapé é fixo e fica sempre visível: resumo da escolha, apelido com contador (em branco entra como Visitante; com conta, mostra o apelido dela), **Entrar na manifestação** e **Só quero assistir**. As etapas funcionam por teclado (setas esquerda e direita) e em celular o menu vira uma folha na parte de baixo, com o personagem visível acima.

## Controles

WASD/setas mover · Shift correr · arrastar para girar a câmera (ou Q/E) · Enter chat · 1 acenar · 2 dançar. Em telas de toque há joystick virtual. "Só quero assistir" abre uma câmera livre sem avatar. O botão do alto liga e desliga o som.

## Próximos passos

- Binário no lugar de JSON no `sync` quando o tráfego pesar.
- Mais rostos: hoje há só 1 corpo (Ready Player Me) para todos; adicione corpos com licença livre (veja "Modelos 3D"). Falta compressão DRACO/KTX2 e LOD: cada personagem do Mixamo tem ~55 mil triângulos, então só ~18% da multidão os usa; o resto usa os dois corpos leves.
- Reduzir o custo da cena: com os modelos humanos chega a ~1000 draw calls e ~3 milhões de triângulos (75 fps num Mac). A qualidade adaptativa (abaixo) ameniza, mas não resolve em celulares fracos.
- Voz por proximidade (LiveKit ou WebRTC).
- Contas: verificação de e-mail, recuperação de senha e login social (Google/Kick).
- Moderação: painel para ver denúncias, banimento por conta/IP e filtro de chat mais completo.
- Áudio real (gravações de multidão, jingles e carros de som) e telão com vídeo.
- Grade espacial no servidor: o laço de interesse é O(n²) por ciclo, suficiente para ~300 jogadores.


> O menu muda de cor conforme o lado escolhido (Petista vermelho, Bolsonarista verde, Anarquistas escuro, Sem partido azul-acinzentado), como no site original.

## Jogabilidade: golpes e carro

- **Golpes** (teclas 4, 5, 6 ou os botões 👊 🦵 🏏): murro, chute e cassetete. Murro e cassetete usam clipes da Universal Animation Library (`strikeNow` → `playOnce` em `src/avatar.js`); o chute é uma pose procedural; o cassetete aparece na mão direita durante o golpe. O cliente anima na hora e manda `{ t: 'attack', kind }`; o servidor (`attack`/`hitTarget` em `server/index.js`) só conta o golpe se os dois estiverem com o PvP ligado: acha o alvo mais perto dentro do alcance e do arco à frente (`MELEE` em `shared/config.js`), empurra-o (`fix`), deixa-o atordoado por alguns décimos (não anda; o cliente também bloqueia o teclado) e soma no placar. Quem leva o golpe cambaleia com um clipe de reação (`staggerNow`; atropelamento usa o de ser jogado para trás).
- **Carro** (tecla C ou o botão 🚗): o jogador entra num carro da cor do seu lado, no lugar onde está. W/S aceleram e freiam, A/D viram (o giro cresce com a velocidade), a câmera segue atrás. A física é no cliente (`VEHICLE` em `shared/config.js`); o servidor só valida a velocidade máxima (16 m/s em vez de 9) quando o estado é `drive`. Os outros jogadores veem o carro no lugar do avatar (`ANIMS` ganhou `drive`).
- **Atropelamento:** com PvP ligado e a mais de 3 m/s, o servidor aplica um golpe `car` em quem estiver a 1,6 m do carro (empurrão de 2,8 m, atordoado 1,2 s, no máximo uma vez a cada 1,5 s por vítima). Figurantes da multidão também caem e deslizam quando um carro (meu ou de outro jogador) passa por cima deles, e levantam 3 s depois (`knock` em `src/crowd.js`; só no cliente, a multidão é local).

## Jogabilidade: vida, domínio e extras

- **Vida e nocaute (PvP):** 100 de vida; tomate 12, murro 10, chute 16, cassetete 18, atropelamento 30 (`COMBAT` em `shared/config.js`). A zero, o jogador é nocauteado por 4 s (deitado, sem andar nem atacar), volta ao ponto de entrada com 3 s de escudo e o lado de quem nocauteou ganha +3. Quem está com escudo ou nocauteado não leva golpe. A vida regenera depois de 6 s sem apanhar e não dá para desligar o PvP por 8 s depois de apanhar. Barra de vida no HUD e sobre a cabeça de quem está ferido; aviso de nocaute para todos no chat. Servidor: `damage`, `announceHp` e o laço de 500 ms em `server/index.js`; mensagens `hp {id, hp, sh, ko}`, `ko {by, ms}`, `feed`.
- **Domínio da Paulista** (`server/zones.js`): 5 trechos (Consolação, MASP, Brigadeiro, Gazeta, Paraíso). O lado com mais gente no trecho (bandeira conta em dobro) vai reduzindo a força do dono até tomá-lo; trecho sem dono precisa de um acúmulo. Cada trecho dominado rende 1 ponto por segundo ao lado. Mensagens `zones {z, scores}` (só quando muda) e `zonecap`.
- **Minimapa** (`src/radar.js`): faixa da avenida com jogadores por cor de lado, trechos coloridos pelo dono, largada e chegada da corrida, o trecho em que você está e o placar do Domínio.
- **Fôlego:** correr (Shift, ou o joystick até o fim) gasta; esgotado, só volta a correr com 25%.
- **Colisão:** barracas, carros, ônibus, postes e totens bloqueiam o jogador (`world.obstacles`, caixas do cenário); o carro bate e perde velocidade.
- **Reações** (teclas 7 a 0 ou o botão 😀): emojis flutuando sobre o jogador, visíveis a quem está perto (`react {e}`, `REACTIONS`).
- **Jogadores** (Tab ou o botão 👥): lista de quem está na avenida, com acertos e nocautes (`who`).
- **Sons:** golpe, nocaute e captura de trecho, sintetizados em `src/audio.js`.

## Reações a golpes

Quem apanha reage conforme o golpe (`staggerNow(kind, hp)` em `src/avatar.js`): soco e cassetete jogam a cabeça para trás, o chute pega no peito, o carro joga a pessoa para trás, o tomate dá um susto rápido; com a vida baixa, soco, chute e cassetete derrubam (clipe `knockback`). Além disso: faíscas de impacto por tipo (`Effects.hit`), número de dano flutuante, som diferente por golpe, tremor de câmera e flash vermelho para quem apanha, empurrão que desliza em vez de teleportar (`me.slide`), tique de confirmação para quem acerta, e no nocaute a queda para trás, o boneco deitado e 💫 girando sobre a cabeça até levantar.

**Figurantes da multidão.** A multidão é local (não existe no servidor), então um golpe ou tomate que não pegou em jogador (o servidor manda `attack`/`throw` com `hit: null`, inclusive com o PvP desligado) atinge o figurante mais próximo à frente de quem bateu, com o mesmo alcance e arco de `MELEE` (`hitCrowd` em `src/main.js`, `hit` em `src/crowd.js`): ele toca o clipe de reação (soco `hitHead`, chute `hit` e às vezes cai, cassetete `knockback`, tomate `hitHead` rápido), vira para quem bateu, leva um empurrão curto e volta ao que fazia. A reação só aparece para quem vê o golpe e não vale pontos nem dano.

## Fogos de artifício

**Fogos de artifício** (`src/effects.js`, `src/fireworks-math.js`, `Ambience.launch/explode` em `src/audio.js`): cada foguete sobe com cabeça brilhante e rastro de faíscas e estoura num de quatro tipos (peônia, anel inclinado, salgueiro dourado ou palmeira), com clarão, rastro das últimas posições, cintilar e partículas que esfriam do branco quente à brasa laranja. A cena é de dia, então as partículas usam mistura normal com alfa (a aditiva some no céu claro). O som é sintetizado, sem arquivos: assobio na subida, estalo seco, corpo de ruído que escurece, trovão grave com eco dos prédios e crepitar; volume, atraso, abafamento e lado (estéreo) vêm da distância e da posição do estouro em relação à câmera, e o efeito avisa o áudio por `onLaunch`/`onBurst`, então os dois ficam sincronizados. O número de partículas cai com o nível de qualidade adaptativa. O botão 🎆 só aparece dentro do jogo.

## Gestos, pulo e cenário

- **Gestos** (menu 🎭): acenar, dançar, Dança 2, chamar, concordar e negar, todos grátis (teclas 1 e 2 para acenar e dançar).
- **Cenário** (`src/scenery.js`): faixas e bandeirinhas atravessando a pista, balões que balançam nas calçadas e, em cada trecho do Domínio, coluna de luz, listras no chão e nome flutuando, na cor do lado que domina. Fogos e confete (captura de trecho) em `src/effects.js`.

## Moderação (silenciar e denunciar)

Tocar no nome de um jogador no chat ou na lista "Na avenida" abre um menu com **Silenciar** (só para você; guardado no navegador, por apelido) e **Denunciar**. A denúncia (`report {id}`) grava na tabela `reports` do SQLite o denunciante, o denunciado e as 5 últimas mensagens dele, com limite de 1 a cada 10 s e 10 por hora por pessoa (conta ou IP), sem repetir o mesmo alvo em 10 min. Com denúncias de **3 pessoas diferentes** em 10 min, o denunciado fica sem falar no chat por 5 min. Para revisar:

```bash
sqlite3 /opt/avenida/data/avenida.db "SELECT datetime(at/1000,'unixepoch'), target_nick, reporter_nick, context FROM reports ORDER BY id DESC LIMIT 20"
```

Convidados não podem usar o apelido de quem já está online (recebem `Nome2`) nem nomes como Sistema ou Admin.

### Administração (denúncias e banimentos)

Defina `ADMIN_TOKEN` no `.env` (16+ caracteres; `openssl rand -hex 24`). Sem ele a API `/api/admin/*` nem existe (404). Com ele, use `Authorization: Bearer <token>`:

```bash
T=seu-token; H=https://seu-dominio.com
curl -H "Authorization: Bearer $T" $H/api/admin/reports?limit=20          # denúncias com as últimas mensagens
curl -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"nick":"Fulano","minutes":1440,"reason":"spam"}' $H/api/admin/ban   # por apelido (conta, ou convidado já denunciado)
curl -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"key":"ip:1.2.3.4"}' $H/api/admin/ban                               # por chave: u12 (conta) ou ip:... (permanente sem "minutes")
curl -H "Authorization: Bearer $T" $H/api/admin/bans                       # banimentos ativos
curl -H "Authorization: Bearer $T" -d '{"id":3}' -H 'content-type: application/json' $H/api/admin/unban
```

Banir derruba quem está online com essa chave e recusa novas conexões (`4003 Banido`). Convidados são identificados pelo IP; atrás de proxy lembre de `TRUST_PROXY=1`.

## Chat: histórico e comandos

Quem entra na avenida recebe as últimas mensagens (até 12, dos últimos 10 min) em tom mais claro, só na primeira entrada (a reconexão não repete). Comandos no chat: `/telao <texto>`, `/fogos` e `/ajuda`.

## Cabeçalhos de segurança

As páginas servidas pelo Node levam `Content-Security-Policy` (scripts só do próprio site; `connect-src` com `ws:`/`wss:` para o jogo; `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` e, com `PUBLIC_URL` https em produção, `Strict-Transport-Security`. As respostas da API não recebem CSP. Ao adicionar scripts ou estilos de outro domínio, atualize a lista em `server/index.js`.

## Qualidade adaptativa

O cliente mede o FPS a cada 3 s; com média abaixo de 28 em duas janelas seguidas, desce um nível: 1 = resolução até 1,25×, 2 = 1× e sem sombras, 3 = 0,75×. O nível fica guardado no navegador. `?q=0` a `?q=3` força um nível para testar.

## Auditoria e correções de segurança

Corrigido: o servidor caía com `look: null`, cookie malformado ou URL inválida (agora há `try/catch` e handlers globais); `attack` aceitava chaves do protótipo (`constructor`) e podia zerar posição e vida de outro jogador; limite de 40 msg/s por conexão e folga menor no anti-teleporte; "Sair da corrida" na contagem deixava o jogador congelado; reconexão de conta expulsava o jogador (agora a sessão antiga cai e a nova entra) e o cliente reinicia corrida, PvP, vida e carro; `X-Forwarded-For` só vale com `TRUST_PROXY=1`; WebSocket confere `Origin` em produção (`PUBLIC_URL` ou `ALLOWED_ORIGINS`); limite de espectadores e corte de clientes que não acompanham; filtro de palavras também no apelido de visitante e no cartaz; checagem de caminho do servidor estático; vazamento de texturas dos esqueletos e do cache de desenhos. Limitação conhecida: o carro é validado só pela velocidade máxima e não há anti-cheat completo (movimento é autoritativo no cliente).

Segunda rodada: o anti-teleporte permitia ~25 m/s a quem mandasse muitas mensagens curtas (a folga fixa de 0,3 m valia por mensagem), o que também fraudava o ranking da corrida; a API usava o primeiro valor de `X-Forwarded-For` (falsificável) no limite de tentativas de login e cadastro, burlando o limite. Agora o IP vem de `server/ip.js` (só confia no proxy com `TRUST_PROXY=1`, usando o último valor).

## Animações

- **Fontes:** quase tudo vem da **Universal Animation Library 1 e 2** (Quaternius, CC0; `assets-src/ual1.glb`, `ual2.glb`, licença em `assets-src/ual-LICENSE-CC0.txt`): parado, andar, correr, murro (`Punch_Cross`/`Punch_Jab`/`Melee_Hook`), cassetete (`Sword_Attack`), levar golpe (`Hit_Chest`/`Hit_Head`/`Hit_Knockback`), arremesso (`OverhandThrow`), dirigir, falar, sim/não. O samba vem da Michelle (three.js) e o aplauso do Mixamo (`clap.glb`). Chute, murro direto e aceno vêm do pacote **Animated Character** de **Zsky** (`assets-src/zsky.glb`, **CC BY 4.0**: exige crédito, ver Créditos abaixo). Sem clipe (por exemplo num corpo sem esses clipes), o aceno e o chute caem para poses procedurais.
- **Zsky** (`/rig.html?make=zsky&save=1` → `public/models/zsky.glb`): o rig dele é diferente (4 ossos de barriga e peito, cotovelo e antebraço separados, pé IK solto na raiz), então não dá para só renomear: o conversor monta um esqueleto novo com nomes Mixamo cuja orientação em repouso é a de um osso do original, amostra cada clipe a 30 quadros/s lendo a rotação no mundo dos ossos de origem e grava a rotação local no novo esqueleto (ossos compostos como Spine1 e ForeArm usam a orientação do último da dupla). O quadril é escalado pela razão quadril→cabeça em relação à UAL.
- **Conversão** (`/rig.html?make=ual1&save=1` e `make=ual2`): os ossos do Rigify (ual1) e do manequim do Unreal (ual2) são renomeados para o padrão Mixamo e só ficam os clipes usados; o manequim fica no arquivo (`public/models/ual1.glb`, `ual2.glb`).
- **Retarget** (`directClip` em `src/models.js`): a rotação de cada osso é levada pelo espaço do mundo como diferença em relação à T-pose. Como as T-poses não são iguais entre esqueletos (no Mixamo as pernas abrem em "A", no Ready Player Me os braços), `alignedRest` primeiro gira cada osso do alvo para a direção do osso correspondente na T-pose da fonte; essa pose alinhada vira o repouso. O giro global entre esqueletos vem do eixo braço esquerdo → direito, não do osso do quadril (cuja convenção muda entre rigs). Todos os corpos, inclusive o Ready Player Me, usam esse caminho.
- **Unidades do quadril:** o deslocamento do quadril vem nas unidades locais da fonte (cm no Mixamo, com raiz a 0,01; metros na UAL e no Zsky) e entra nas do alvo. `directClip` converte pela razão das escalas do pai de cada esqueleto (`ps` em `restInfo`); sem isso, o samba dos corpos em metros (Ready Player Me) deslocava o quadril 100× e o boneco "pulava" pelo cenário.
- **Clipes de uma vez** (`playOnce` em `src/avatar.js`): golpes, reação ao golpe e arremesso tocam por cima do clipe atual e voltam sozinhos.

## Cenário

- **Avenida** (`src/world.js`): 24 m de pista com ciclovia vermelha no canteiro central (bordas brancas, eixo amarelo, bicicletas pintadas, meio-fio separador), três faixas e a de ônibus em cada sentido, e calçadas de 7,5 m. Os cruzamentos têm duas faixas de pedestres com a grade amarela entre elas, semáforos pretos no canteiro, gradis e totens pretos com o nome da próxima rua. Postes altos de braço duplo no canteiro e cones laranja de fechamento de domingo.
- **Tipos de prédio**: vidro com brises, escritório de concreto com janelas em faixas, residencial com varandas, residencial listrado, brises horizontais cor de terracota e clássico. Até cinco prédios altos levam torres de TV treliçadas vermelhas e brancas.

- **Árvores** (`src/trees.js`): tipuanas, sibipirunas e ipês (amarelos, roxos e rosa) com tronco, galhos e copa de cartões de folhagem desenhados em canvas. Cada espécie é um par de `InstancedMesh` (tronco e copa), com a cor da copa por instância.
- **Prédios** (`src/world.js`): torres em um ou dois blocos (o de cima recuado), fachadas em resolução dobrada e detalhes instanciados por categoria: marquise sobre a calçada, brises e frisos nos de vidro, varandas com guarda-corpo de vidro nos residenciais, cornijas e aparelhos de ar nos clássicos, condensadores na cobertura e luz vermelha nas antenas.
- **Barracas** (`src/props.js`): carrinhos de churrasquinho com picanha no espeto, brasa e fumaça, e barracas da feira com abóboras (laranja, moranga e cabotiá). A multidão desvia delas, e alguns figurantes andam com um espetinho na mão.

## Veículos, calçadas e rua (visual)

- **Veículos** (`src/vehicles.js`): carrocerias arredondadas (perfil lateral extrudado com chanfro) em três tipos de carro (sedan, hatch, SUV), vidros escuros e brilhantes, pneus com roda de liga, faróis e lanternas que brilham, retrovisores, placas e tinta metálica com verniz. Ônibus com janelas, porta, ar-condicionado, letreiro e faixa lateral; carro de som com cabine, vidros e caixas com alto-falantes. Cada veículo é um `Mesh` com 6 materiais (tinta, vidro, acabamento por vértice, roda, farol, lanterna) e a geometria é compartilhada entre veículos do mesmo tipo. `carMesh(color, skin, type)` mantém a API antiga (`skin`: `carro-dourado` ou `carro-som`).
- **Sem piscar (z-fighting):** nenhuma face de uma peça fica no mesmo plano de outra que a atravessa; peças sobrepostas se afastam ao menos 1 cm e calcomanias (vidro, faixa) ficam 2 a 4 cm para fora. O ônibus antigo piscava porque a faixa lateral tinha as faces da frente e de trás coincidentes com a carroceria.
- **Sombra estável** (`src/shadow.js`): o foco da câmera de sombra é ancorado na grade de texels da luz, e não nos eixos do mundo, então as sombras (e a auto-sombra de carros e ônibus) não tremem quando o jogador anda.
- **Calçada** (`sidewalkTexture` / `sidewalkNormal` em `src/textures.js`): 7,5 m do meio-fio aos prédios, com meio-fio e faixa de granito, faixa de serviço (árvores, postes) e placas de concreto, faixa podotátil amarela com nervuras, tira de pedra portuguesa preta e branca, e relevo nas juntas. No lado esquerdo a textura é espelhada.
- **Rua:** faixa de ônibus terracota e sarjeta de concreto junto ao meio-fio, pisos táteis de alerta vermelhos nas rampas das esquinas, grades de ferro nas árvores e balizadores ao longo do meio-fio. Cones com faixas refletivas, lixeiras com tampa e postes com luminária.
- **Depuração:** `window.__AVENIDA__.setCamera([x,y,z], [alvoX,alvoY,alvoZ])` fixa a câmera para inspecionar o cenário (`setCamera(null)` devolve o controle).

## Créditos e licenças

- **Código:** MIT (`LICENSE`). **Arquivos de terceiros:** ver `ASSETS.md`.
- **Zsky** (`@Zsky_01`): animações de chute, murro e aceno do pacote *Animated Character*, **CC BY 4.0**. Crédito obrigatório: <https://www.patreon.com/Zsky>. Licença original em `assets-src/zsky-LICENSE-CCBY.txt`. O crédito também aparece no jogo, em "Créditos", no rodapé do menu. As animações foram adaptadas (rig refeito e convertido para os esqueletos Mixamo).
- **Quaternius**: Universal Animation Library 1 e 2, **CC0** (crédito não é obrigatório; licença em `assets-src/ual-LICENSE-CC0.txt`).
- **Ready Player Me**: avatar de exemplo do repositório de exemplos do three.js; confira os termos atuais antes de reutilizar.

## Qualidade do catálogo

- **Auditoria do catálogo** (`test/catalog.test.js`): todo item tem ícone, nome e slot válidos, os desenhos apontam para itens que existem e todo item pode ser equipado.

## Segurança

- **Checagem da VPS** (só leitura): `bash /opt/avenida/deploy/seguranca-check.sh` confere permissões do `.env`, dono do código, backups, variáveis perigosas (`TRUST_PROXY`, `ADMIN_TOKEN`), nota de sandbox do systemd, SSH só com chave, firewall, fail2ban e atualizações pendentes.
- **Serviço em sandbox** (`deploy/avenida.service`, instalado pelo `update.sh`): sem privilégios novos, sistema de arquivos somente leitura exceto `data/`, sem capacidades, famílias de rede limitadas. O código fica do `root` e só `data/` é do usuário `avenida`; o `.env` é `root:avenida 640`. Se o site não responder em `/healthz` depois de uma troca de unidade, o `update.sh` volta a unidade anterior e falha o deploy.
- **Deploy automático** com token mínimo (`permissions: contents: read`), sem executar scripts de instalação das dependências (`npm ci --ignore-scripts`) e, se existir o secret `VPS_KNOWN_HOSTS` (saída de `ssh-keyscan -t ed25519 SEU_IP`), com a chave do servidor fixada. **Restrinja a chave de deploy** no `~/.ssh/authorized_keys` da VPS para ela só poder rodar o deploy: `command="cd /opt/avenida && BRANCH=main bash deploy/update.sh",restrict ssh-ed25519 AAAA… deploy`.
- **Senhas** em scrypt (N=2¹⁵, r=8, p=3, 32 MiB) com parâmetros dentro do hash; hashes antigos são regravados no próximo login.
- **Apelidos reservados**: contas e convidados não podem usar nomes de equipe ou do sistema (`Admin`, `Suporte`, `Moderador`…), nem variações com acento, números no lugar de letras ou letras parecidas de outros alfabetos, nem `Excluído…` (que o servidor usa nas contas apagadas). Contas antigas com esses nomes: `runuser -u avenida -- node --env-file=.env deploy/apelidos-reservados.mjs` lista e, com `--renomear`, troca por `Jogador<id>`.
- `X-Forwarded-Host` e `X-Forwarded-Proto` só valem com `TRUST_PROXY=1` em produção; corpo de requisição grande recebe 413 e a conexão é encerrada.
- Testes de segurança em `test/security.test.js` (caminhos fora do site, cabeçalhos, cookie, CSRF, força bruta, WebSocket, itens, apelidos).

## Header (topo)

Uma linha só em qualquer tela (52 px no celular, 56 px no desktop), conferida de 320 a 1280 px: marca, **contador ao vivo** (total online com ponto pulsante e, em cápsula única, quantos há em cada grupo; nome do grupo só em telas largas, `title`/`aria-label` sempre) e ações com o mesmo estilo de botão (`.tbtn`: ícone + rótulo, só o ícone em telas estreitas). No menu inicial: visitante vê **Entrar**; quem tem conta vê **Visual** e o **menu da conta** (avatar com a inicial, apelido), que guarda Meu visual, **Sair da conta** e, separada e em vermelho, **Excluir conta…** (antes ficava sempre à vista). O menu abre por clique ou teclado, setas movem o foco, `Esc` e clique fora fecham e devolvem o foco. No jogo: **Visual**, **Som** (com `aria-pressed`) e **Sair**.
