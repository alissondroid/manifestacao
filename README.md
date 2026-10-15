# Avenida Online · Eleições 2026 na Paulista

Manifestação online na Avenida Paulista, direto no navegador. Você escolhe o lado (**Petista** (13), **Bolsonarista** (22), **Anarquistas** ou **Sem partido**), monta um personagem brasileiro, leva bandeira ou cartaz e conversa com os outros jogadores em tempo real. MVP inspirado na arquitetura do manifestacao.com, com arte própria.

**Aviso jurídico:** projeto independente, sem vínculo com candidatos, partidos ou campanhas. Os nomes e números identificam apenas os lados da disputa. Há três personagens prontos com a aparência de políticos reais (Renan Santos, Lula e Bolsonaro), em tom de sátira; isso envolve direito de imagem, e os modelos vieram de terceiros (Tripo e Sketchfab): confira a licença de cada arquivo (o do Sketchfab pode exigir crédito ao autor). Antes de publicar, revise a legislação eleitoral (propaganda, uso de nome de candidato e monetização em período eleitoral) e os termos de uso.

## Rodar

```bash
npm install
npm run dev      # servidor WebSocket (8787) + Vite (http://localhost:5180)
```

Produção (um único processo serve o build e o WebSocket):

```bash
npm run build
npm start        # http://localhost:8787
```

Variáveis do servidor (arquivo `.env`, veja `.env.example`): `PORT`, `MAX_PLAYERS` (300), `MAX_PER_IP` (5), `AOI` (raio de interesse em metros, 70), `BLOCKED_WORDS` (lista separada por vírgula para mascarar no chat), `DB_PATH` (padrão `data/avenida.db`), `PUBLIC_URL` (URL pública, usada nos retornos do pagamento; defina em produção) e as de pagamento abaixo.

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
| `src/models.js` | Carrega os modelos humanos glTF (`public/models`), retargeta as animações do Mixamo para os dois corpos e clona personagens com materiais próprios |
| `src/avatar.js` | Avatar com modelo humano real animado por `AnimationMixer` (parado, andando, correndo, dançando; aceno por cinemática nos ossos do braço). Os personagens comuns vestem camiseta e bermuda com cores à escolha (o Rosto 1 masculino também troca pele e barba); Lula, Renan e Bolsonaro ficam com a roupa original e não trocam de roupa; todos aceitam a opção Idoso; acessórios da loja, bandeira e cartaz seguem os ossos |
| `server/db.js` | SQLite embutido do Node (`node:sqlite`): usuários, sessões, pedidos, itens e equipados |
| `server/auth.js` | Senhas com scrypt, sessões por cookie HttpOnly, limite de tentativas, validações |
| `server/api.js` | Rotas HTTP: conta, loja, checkout, retorno do pagamento, webhook e checkout simulado |
| `server/payments.js` | Stripe Checkout (REST, só chave de teste) e verificação da assinatura do webhook |
| `server/shop.js` | Entrega idempotente de itens e regras de equipar |
| `src/account.js` | Login/cadastro, loja e retorno do checkout (modais) |
| `src/api.js` | Cliente da API HTTP |
| `src/net.js` | Cliente WebSocket com reconexão (reenvia `join` ou `watch`) |
| `src/audio.js` | Som ambiente sintetizado (multidão, buzinas distantes, pop de chat), sem arquivos |
| `src/ui.js` | Lobby, HUD, chat, joystick de toque e rótulos flutuantes |
| `src/portraits.js` | Personagens prontos (Homem, Mulher, Tiozão do Zap, Tia da família, Jovem, Seu Zé, Moça, Rapaz) e os retratos deles, renderizados do modelo 3D num render target |
| `src/main.js` | Loop do jogo, câmera, controles, interpolação dos outros jogadores |

## Protocolo (JSON sobre WebSocket, `/ws`)

Cliente → servidor: `join {nick, side, look}`, `watch` (espectador), `move {x, z, ry, a}`, `chat {text}`.

Servidor → cliente: `online {counts}`, `welcome {id, x, z}`, `sync {add, del, s}` (10 Hz), `chat {id, nick, side, text}`, `look {id, look}` (itens equipados mudaram), `denied {reason}` (entrada recusada), `fix {x, z}`.

`sync` é o interesse por área: cada cliente só recebe `add` (jogador entrou no raio, com visual completo), `del` (saiu do raio ou da avenida) e `s` (posições que mudaram, `[id, x, z, ry, anim]`). A saída do raio tem histerese de 10 m para não piscar. Espectadores recebem todos.

O servidor limita a velocidade, recorta a posição ao mapa, sanitiza textos e aplica cooldown de chat.

## Hospedagem (VPS Ubuntu)

Precisa de um processo Node 22+ sempre ligado, com WebSocket e disco (não serve Vercel/serverless nem hospedagem compartilhada). Na VPS, como root:

```bash
apt-get update && apt-get install -y git
git clone -b main https://github.com/alissondroid/avenida-online.git /opt/avenida   # repositório privado: use um token na URL
DOMAIN=seu-dominio.com BRANCH=main bash /opt/avenida/deploy/setup.sh               # sem DOMAIN: HTTP no IP, só para testar
```

O script instala Node 22 e Caddy (HTTPS automático), faz o build, cria o serviço `systemd` `avenida` (usuário sem login, reinício automático), o `.env`, o firewall (22, 80 e 443) e um backup diário do SQLite em `/var/backups/avenida` (14 dias). Depois edite `/opt/avenida/.env` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) e rode `systemctl restart avenida`. Para atualizar: `bash /opt/avenida/deploy/update.sh`. Logs: `journalctl -u avenida -f`. Em produção sem chave Stripe a loja fica desligada de propósito.

## Termos, privacidade e LGPD

`/termos` e `/privacidade` (páginas estáticas em `public/termos` e `public/privacidade`) são **modelos para revisão com um advogado**: os campos destacados em amarelo precisam ser preenchidos (nome/razão social, CPF/CNPJ, cidade, e-mail de contato, provedor). Na VPS: `bash /opt/avenida/deploy/preencher-legal.sh "NOME" "CPF/CNPJ" "CIDADE/UF" "EMAIL" "Hostinger"` e depois `systemctl restart avenida`. O cadastro exige o aceite (`terms: true`, gravado em `users.terms_at`) e o botão "Excluir conta" (`POST /api/auth/delete`, pede a senha) apaga e-mail, senha, itens, desenhos, sessões e recordes, anonimiza o usuário e mantém só os pedidos pagos (obrigação fiscal). Se passar a usar analytics, anúncios ou cookies de terceiros, atualize a política e adicione um aviso de cookies.

## SEO e identidade

`index.html` traz título, descrição, canonical (`https://avenidaonline.com/`), Open Graph e Twitter Card (`public/og-image.png`, 1200×630), JSON-LD (`WebSite` e `VideoGame`) e um `<noscript>` com texto. Em `public/`: `favicon.svg`, `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest` (instalável como app), `robots.txt` (bloqueia `/api/` e `/pagar/`) e `sitemap.xml` (inclui `/termos` e `/privacidade`). O servidor responde 404 de verdade para caminhos inexistentes e define cache (HTML sem cache, `assets/` imutáveis). Se o domínio mudar, troque `avenidaonline.com` em `index.html`, `robots.txt` e `sitemap.xml`. Depois de publicar, cadastre o site no Google Search Console e envie o `sitemap.xml`.

## Contas e loja (modo de teste)

- **Conta:** e-mail, apelido único e senha (mín. 8). A sessão fica num cookie `HttpOnly; SameSite=Lax` (30 dias), no banco só o hash do token. Quem tem conta joga com o apelido dela; convidados continuam sem cadastro, mas não podem usar o apelido de uma conta.
- **Itens:** camisa amarela, camisa do lado (número, círculo-A ou "sem partido" no peito e nas costas), camisa simples (cor à escolha) e "sua camisa" (cor, símbolo e texto no peito e nas costas); as camisas não valem para Lula, Renan e Bolsonaro, boné do time, chapéu de palha, óculos escuros e bandeira gigante (catálogo em `shared/config.js`, preços em centavos de BRL). O que está equipado vem do banco, nunca do cliente, e muda ao vivo para quem está vendo (mensagem `look`).
- **Pagamento sem chave:** provedor **simulado**, uma página local marcada como teste com "Simular Pix pago", "Simular cartão aprovado" e "Cancelar". Nada é cobrado.
- **Pagamento Stripe (teste):** copie `.env.example` para `.env` e preencha `STRIPE_SECRET_KEY` com uma chave `sk_test_…`. O servidor cria uma sessão do Stripe Checkout em BRL sem fixar o método, então aparecem os ativos no Dashboard (ative o **Pix** em Configurações > Métodos de pagamento). Chaves `sk_live_` são recusadas, a menos que `ALLOW_LIVE_PAYMENTS=1`.
- **Entrega do item:** pelo webhook `POST /api/stripe/webhook` (eventos `checkout.session.completed` com pagamento confirmado e `checkout.session.async_payment_succeeded`, este é o do Pix), com assinatura verificada por `STRIPE_WEBHOOK_SECRET`. Ao voltar do checkout o cliente também consulta o pedido, então funciona mesmo antes do webhook chegar. A entrega é idempotente.
- **Webhook local:** `stripe listen --forward-to localhost:8787/api/stripe/webhook` mostra o `whsec_…` a colocar no `.env`.
- **Testar Pix no Stripe:** no checkout escolha Pix, use o CPF de teste `000.000.000-00` e clique em "Simular scan".

## Modelos 3D e créditos

Os personagens são modelos glTF com esqueleto em `public/models` (cada um com ~4 MB). Nos personagens comuns, a roupa original (terno, agasalho, uniforme, moletom) vira camiseta e bermuda na carga: `src/models.js` marca cada vértice da roupa pelos ossos que o movem (antebraço e canela viram pele, capuz e abas do paletó somem) e um shader pinta cada região com a cor escolhida:

| Arquivo | Quem é | Origem |
|---|---|---|
| `readyplayer.me.glb` | Homem (Rosto 1): aceita pele e barba | avatar de exemplo do Ready Player Me (repositório de exemplos do three.js) |
| `ch33.glb` | Homem (Rosto 2) | Mixamo (`character.fbx`) |
| `ch08.glb` | Homem (Rosto 3) | Mixamo (`character (1).fbx`) |
| `Michelle.glb` | Não aparece mais no jogo: serve só de fonte da animação de samba e da pose de referência | Mixamo (exemplo do three.js) |
| `ch16.glb` | Mulher de touca, sem máscara (Rosto 2) | Mixamo (`Ch16_nonPBR.fbx`) |
| `ch02.glb` | Mulher (Rosto 1) | Mixamo (`Ch02_nonPBR.fbx`) |
| `renan.glb` | Renan Santos (Homem, Rosto 4) | malha estática do Tripo (`assets-src/renan.glb`) com o esqueleto do ch33 ajustado às proporções dela e pesos copiados do ch33 (`/rig.html?make=renan&save=1`) |
| `bolsonaro.glb` | Bolsonaro (Homem, Rosto 5) | cabeça do Sketchfab (`assets-src/bolsonaro-head.glb`) presa ao osso da cabeça do ch33, que perde a cabeça e o cabelo (`/rig.html?make=bolsonaro&save=1`) |
| `lula.glb` | Lula (Homem, Rosto 6) | malha estática do Sketchfab (`assets-src/lula.glb`, em pose "A" e de costas): virada de frente, esqueleto do ch33 com os braços inclinados até a pose dela, pesos copiados do ch33 e suavizados pela malha; fica ligada na pose "A" e traz um clipe `TPose` de referência (`/rig.html?make=lula&save=1`) |
| `clap.glb` | Só a animação de aplauso (esqueleto sem malha), convertida para todos os corpos | Mixamo "Standing Clap" (`assets-src/clap.fbx`, `/rig.html?make=clap&save=1`) |
| `Soldier.glb` | só as animações Idle/Walk/Run; o modelo não aparece | Mixamo (exemplo do three.js) |

Os `.glb` do Mixamo foram convertidos dos FBX originais (50 a 87 MB, com texturas 4K) por `src/dev-convert.js`, uma ferramenta de desenvolvimento aberta em `/convert.html?file=<nome>.fbx&mode=export&out=<nome>.glb`: junta as hierarquias de ossos duplicadas que o FBXLoader cria, unifica o esqueleto de todas as malhas (65 ossos), reduz as texturas para 1024 px (JPEG nas opacas, PNG com alfa no cabelo e cílios), indexa a geometria e normaliza o nome dos ossos para `mixamorig…`. Os FBX originais ficam em `assets-src/` (ignorado pelo git e fora do build). Para adicionar um personagem: coloque o FBX em `assets-src/`, converta, registre em `CHARACTERS` (`src/models.js`) e em `MODELS` (`shared/config.js`).

**Animações:** os cinco corpos do Mixamo (Michelle e os quatro convertidos) usam um retarget próprio, `directClip` em `src/models.js`: os eixos locais dos ossos diferem entre o Soldier (fonte de Idle/Walk/Run) e os personagens, então cada rotação é levada pelo referencial do mundo, usando a T-pose de cada arquivo (o clipe `TPose`) como referência e a rotação global entre elas (o Soldier olha para −Z). O quadril recebe a translação: só o balanço vertical em Idle/Walk/Run, e o balanço completo na dança, sempre sem deriva (a média do clipe é descontada). O corpo do Ready Player Me, que não está em T-pose, usa `SkeletonUtils.retargetClip` com a fonte girada 180° em Y, para olhar para +Z. Verificação rápida no console: `window.__AVENIDA__` expõe `Avatar`, e para cada rosto o pé de apoio deve andar para trás em relação ao quadril durante o Walk.

Os termos do Mixamo e do Ready Player Me permitem usar esses recursos em projetos, mas **não** redistribuí-los como arquivos avulsos; como estão na pasta pública, os jogadores conseguem baixá-los. Antes de publicar, confira as licenças atuais de cada um.

## Modos extras

- **Corrida** (botão 🏁 no HUD): quem entra espera até 15 s por outros corredores, é levado à linha de largada (pórtico em z = −100), conta 3-2-1 e corre até a chegada (z = +100). O servidor marca o tempo pela posição que já valida; resultado da prova e os 10 melhores tempos ficam em `race_times` (SQLite, `GET /api/race/top`). Mensagens `race {action}` do cliente e `race {state, n, startsIn, results, top}` do servidor.
- **PvP, a tomatada** (botão 🍅, tecla F para arremessar): só entre quem ligou o PvP. O servidor resolve o acerto pela posição e direção de quem arremessa (alcance 18 m, raio 0,9 m, 1 arremesso a cada 1,2 s) e manda `throw` para quem está perto (o cliente anima o tomate) e `hitby` para o atingido. Placar por lado e os 5 maiores acertadores em `pvp {scores, top}`.

## Cartaz e bandeira personalizados

Itens "Seu cartaz" (R$ 2) e "Sua bandeira" (R$ 4). Depois de comprar, o botão ✏️ Editar na loja abre o editor: texto (40 ou 16 caracteres), cor de fundo e do texto (paleta fixa) e um símbolo. O desenho é validado e salvo no servidor (`POST /api/shop/design`, tabela `designs`), passa pelo filtro de palavras e viaja para os outros jogadores dentro de `look.custom`. O cartaz personalizado substitui o cartaz grátis quando "Cartaz" está na mão; a bandeira personalizada substitui a do lado quando "Bandeira do candidato" está na mão.

## Lobby

Layout no espírito do manifestacao.com: barra no topo com logo e online por lado; à esquerda o personagem em 3D com o chamado "Entre na Paulista. Do seu jeito." e as abas de animação (parado, andando, correndo, acenando, dançando; arraste para girar); à direita o menu **"Monte seu personagem"**, em quatro etapas:

1. **Lado**: Petista (13), Bolsonarista (22), Anarquistas ou Sem partido, com o contador de online de cada um.
2. **Personagem**: seis personagens prontos numa fila (Homem, Mulher, Tiozão do Zap, Renan Santos, Lula e Bolsonaro) com retratos do modelo 3D e o botão 🎲 Sortear. Idosos e demais variações ficam em Visual.
3. **Visual**: corpo, idade, rosto e altura; pele, barba, camisa e calça só aparecem no rosto que aceita tingir (o texto explica quando não).
4. **Na mão**: nada, bandeira do Brasil, bandeira do lado, cartaz com texto, picanha no espeto ou abóbora. No PvP, quem segura picanha ou abóbora arremessa o próprio item em vez do tomate.

O rodapé é fixo e fica sempre visível: resumo da escolha, apelido com contador (em branco entra como Visitante; com conta, mostra o apelido dela), **Entrar na manifestação** e **Só quero assistir**. As etapas funcionam por teclado (setas esquerda e direita) e em celular o menu vira uma folha na parte de baixo, com o personagem visível acima.

## Controles

WASD/setas mover · Shift correr · arrastar para girar a câmera (ou Q/E) · Enter chat · 1 acenar · 2 dançar. Em telas de toque há joystick virtual. "Só quero assistir" abre uma câmera livre sem avatar. O botão do alto liga e desliga o som.

## Próximos passos

- Binário no lugar de JSON no `sync` quando o tráfego pesar.
- Mais rostos: hoje são 6 modelos (3 homens, 3 mulheres). O domínio `models.readyplayer.me` não resolve mais; novos personagens vêm do Mixamo (veja acima). Falta compressão DRACO/KTX2 e LOD: cada personagem do Mixamo tem ~55 mil triângulos, então só ~18% da multidão os usa; o resto usa os dois corpos leves.
- Ajuste de qualidade automático (sombras e resolução) em celulares fracos; com os modelos humanos a cena chega a ~1000 draw calls e ~3 milhões de triângulos (75 fps num Mac; celulares fracos vão sofrer).
- Voz por proximidade (LiveKit ou WebRTC).
- Contas: verificação de e-mail, recuperação de senha e login social (Google/Kick).
- Pagamento: recibos/nota fiscal, reembolsos e painel de pedidos; revisar impostos e termos antes de cobrar de verdade.
- Moderação: denúncia, banimento por conta/IP e filtro de chat mais completo.
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

## Monetização e loja

Tudo é cosmético ou de diversão; **nada dá vantagem no PvP** (catálogo em `SHOP`, `shared/config.js`; entrega em `server/shop.js`). Compra só com conta.

| Tipo | Exemplos | Como funciona |
|---|---|---|
| **VIP** (`vip`) | Apoiador VIP 30 dias, R$ 9,90 | `users.vip_until` (renova somando 30 dias). Nome dourado, selo ⭐, gestos premium e 3 fogos de brinde |
| **Pacotes** | Pacote de gestos (`unlock`), Kit manifestante e Kit festa (`bundle`, 30–35% de desconto) | Liberam gestos ou vários itens de uma vez |
| **Visual** | Cartola, capacete, faixa, coroa, óculos aviador, máscara, mochila, capa, asas, aura do lado/dourada, selos 🔥🥩💎, carro dourado e carro de som, além de camisas, boné, bandeira e cartaz personalizados | Slots `head face shirt back flag sign fx badge car`; aparecem para todos |
| **Consumíveis** | 5 fogos (R$ 3), 3 mensagens no telão (R$ 4) | Tabela `inventory`. Fogos: botão 🎆 ou `/fogos`, explodem sobre o jogador para quem está perto. Telão: `/telao texto` no chat, passa no telão 3D e no topo da tela de todos (1 a cada 12 s, passa pelo filtro de palavras) |
| **Apoio** | R$ 5, 10 ou 25 | Dão o selo 💛 |

Repetíveis (`vip`, `consumable`, `donation`) podem ser comprados de novo; os demais só uma vez. Um pedido pendente do mesmo item volta ao mesmo checkout (evita cobrança dupla). O webhook do Stripe confere sessão, valor e moeda, e a entrega vale mesmo se o pedido tinha sido marcado como falho. **Em produção sem chave Stripe a loja fica desligada** (o checkout simulado só funciona em desenvolvimento ou com `ALLOW_SIMULATED=1`). Antes de cobrar de verdade: revisar a legislação eleitoral, impostos, termos e nota fiscal.

## Gestos, pulo e cenário

- **Gestos** (menu 🎭): acenar, dançar e aplaudir são grátis; Dança 2, chamar, concordar e negar são premium (o servidor descarta o gesto de quem não tem direito). **Pulo** com Espaço ou ⤴️ (visível para os outros). O avatar gesticula (`talk`) quando fala no chat; nocauteados ficam deitados.
- **Cenário** (`src/scenery.js`): faixas e bandeirinhas atravessando a pista, balões que balançam nas calçadas e, em cada trecho do Domínio, coluna de luz, listras no chão e nome flutuando, na cor do lado que domina. Fogos e confete (captura de trecho) em `src/effects.js`.

## Auditoria e correções de segurança

Corrigido: o servidor caía com `look: null`, cookie malformado ou URL inválida (agora há `try/catch` e handlers globais); `attack` aceitava chaves do protótipo (`constructor`) e podia zerar posição e vida de outro jogador; limite de 40 msg/s por conexão e folga menor no anti-teleporte; "Sair da corrida" na contagem deixava o jogador congelado; reconexão de conta expulsava o jogador (agora a sessão antiga cai e a nova entra) e o cliente reinicia corrida, PvP, vida e carro; `X-Forwarded-For` só vale com `TRUST_PROXY=1`; WebSocket confere `Origin` em produção (`PUBLIC_URL` ou `ALLOWED_ORIGINS`); limite de espectadores e corte de clientes que não acompanham; filtro de palavras também no apelido de visitante e no cartaz; checagem de caminho do servidor estático; vazamento de texturas dos esqueletos e do cache de desenhos. Limitação conhecida: o carro é validado só pela velocidade máxima e não há anti-cheat completo (movimento é autoritativo no cliente).

## Animações

- **Fontes:** quase tudo vem da **Universal Animation Library 1 e 2** (Quaternius, CC0; `assets-src/ual1.glb`, `ual2.glb`, licença em `assets-src/ual-LICENSE-CC0.txt`): parado, andar, correr, murro (`Punch_Cross`/`Punch_Jab`/`Melee_Hook`), cassetete (`Sword_Attack`), levar golpe (`Hit_Chest`/`Hit_Head`/`Hit_Knockback`), arremesso (`OverhandThrow`), dirigir, falar, sim/não. O samba vem da Michelle (three.js) e o aplauso do Mixamo (`clap.glb`). Chute, murro direto e aceno vêm do pacote **Animated Character** de **Zsky** (`assets-src/zsky.glb`, **CC BY 4.0**: exige crédito, ver Créditos abaixo). Sem clipe (por exemplo num corpo sem esses clipes), o aceno e o chute caem para poses procedurais.
- **Zsky** (`/rig.html?make=zsky&save=1` → `public/models/zsky.glb`): o rig dele é diferente (4 ossos de barriga e peito, cotovelo e antebraço separados, pé IK solto na raiz), então não dá para só renomear: o conversor monta um esqueleto novo com nomes Mixamo cuja orientação em repouso é a de um osso do original, amostra cada clipe a 30 quadros/s lendo a rotação no mundo dos ossos de origem e grava a rotação local no novo esqueleto (ossos compostos como Spine1 e ForeArm usam a orientação do último da dupla). O quadril é escalado pela razão quadril→cabeça em relação à UAL.
- **Conversão** (`/rig.html?make=ual1&save=1` e `make=ual2`): os ossos do Rigify (ual1) e do manequim do Unreal (ual2) são renomeados para o padrão Mixamo e só ficam os clipes usados; o manequim fica no arquivo (`public/models/ual1.glb`, `ual2.glb`).
- **Retarget** (`directClip` em `src/models.js`): a rotação de cada osso é levada pelo espaço do mundo como diferença em relação à T-pose. Como as T-poses não são iguais entre esqueletos (no Mixamo as pernas abrem em "A", no Ready Player Me os braços), `alignedRest` primeiro gira cada osso do alvo para a direção do osso correspondente na T-pose da fonte; essa pose alinhada vira o repouso. O giro global entre esqueletos vem do eixo braço esquerdo → direito, não do osso do quadril (cuja convenção muda entre rigs). Todos os corpos, inclusive o Ready Player Me, usam esse caminho.
- **Unidades do quadril:** o deslocamento do quadril vem nas unidades locais da fonte (cm no Mixamo, com raiz a 0,01; metros na UAL e no Zsky) e entra nas do alvo. `directClip` converte pela razão das escalas do pai de cada esqueleto (`ps` em `restInfo`); sem isso, o samba dos corpos em metros (Ready Player Me) deslocava o quadril 100× e o boneco "pulava" pelo cenário.
- **Clipes de uma vez** (`playOnce` em `src/avatar.js`): golpes, reação ao golpe e arremesso tocam por cima do clipe atual e voltam sozinhos.
- **Aplauso:** quarto emote (👏, tecla 3), também usado por ~22 % dos figurantes parados; as pernas ficam retas (`pin`), porque o clipe do Mixamo vem agachado.

## Cenário

- **Avenida** (`src/world.js`): 24 m de pista com ciclovia vermelha no canteiro central (bordas brancas, eixo amarelo, bicicletas pintadas, meio-fio separador), três faixas e a de ônibus em cada sentido, e calçadas de 7,5 m. Os cruzamentos têm duas faixas de pedestres com a grade amarela entre elas, semáforos pretos no canteiro, gradis e totens pretos com o nome da próxima rua. Postes altos de braço duplo no canteiro e cones laranja de fechamento de domingo.
- **Tipos de prédio**: vidro com brises, escritório de concreto com janelas em faixas, residencial com varandas, residencial listrado, brises horizontais cor de terracota e clássico. Até cinco prédios altos levam torres de TV treliçadas vermelhas e brancas.

- **Árvores** (`src/trees.js`): tipuanas, sibipirunas e ipês (amarelos, roxos e rosa) com tronco, galhos e copa de cartões de folhagem desenhados em canvas. Cada espécie é um par de `InstancedMesh` (tronco e copa), com a cor da copa por instância.
- **Prédios** (`src/world.js`): torres em um ou dois blocos (o de cima recuado), fachadas em resolução dobrada e detalhes instanciados por categoria: marquise sobre a calçada, brises e frisos nos de vidro, varandas com guarda-corpo de vidro nos residenciais, cornijas e aparelhos de ar nos clássicos, condensadores na cobertura e luz vermelha nas antenas.
- **Barracas** (`src/props.js`): carrinhos de churrasquinho com picanha no espeto, brasa e fumaça, e barracas da feira com abóboras (laranja, moranga e cabotiá). A multidão desvia delas, e alguns figurantes andam com um espetinho na mão.

## Créditos e licenças

- **Zsky** (`@Zsky_01`): animações de chute, murro e aceno do pacote *Animated Character*, **CC BY 4.0**. Crédito obrigatório: <https://www.patreon.com/Zsky>. Licença original em `assets-src/zsky-LICENSE-CCBY.txt`. O crédito também aparece no jogo, em "Créditos", no rodapé do menu. As animações foram adaptadas (rig refeito e convertido para os esqueletos Mixamo).
- **Quaternius**: Universal Animation Library 1 e 2, **CC0** (crédito não é obrigatório; licença em `assets-src/ual-LICENSE-CC0.txt`).
- **Mixamo/Adobe**: personagens e a animação de aplauso (termos do Mixamo; não redistribuir os arquivos originais).
- **three.js**: Soldier/Michelle de exemplo (MIT).
- Modelos de pessoas reais: ver o aviso jurídico no topo.
