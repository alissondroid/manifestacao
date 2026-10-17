# Kit de divulgação · semana 1

Links com origem (a contagem aparece em `GET /api/admin/stats`, com `Authorization: Bearer $ADMIN_TOKEN`):

| Canal | Link |
|---|---|
| TikTok (bio) | `https://avenidaonline.com/?src=tiktok` |
| Instagram (bio) | `https://avenidaonline.com/?src=insta` |
| YouTube Shorts | `https://avenidaonline.com/?src=shorts` |
| X / Twitter | `https://avenidaonline.com/?src=x` |
| Reddit | `https://avenidaonline.com/?src=reddit` |
| WhatsApp / Telegram | `https://avenidaonline.com/?src=zap` |
| itch.io / portais | `https://avenidaonline.com/?src=itch` |
| Criadores | `https://avenidaonline.com/?src=` + nome do criador (ex.: `joao`) |

Link para um lado específico: acrescente `&lado=petista|bolsonarista|anarquia|sem-partido`. O botão 📣 Convidar do jogo já gera esse link (`src=convite`).

Ver os números:

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" https://avenidaonline.com/api/admin/stats?days=7
```

`visit` = abas abertas, `new` = primeira vez no navegador, `enter` = entrou na avenida, `share` = tocou em Convidar.
Taxa de entrada = `enter / visit`. Sem IP e sem cookie: só contadores por dia e origem.

## Vídeos (15–30 s, vertical 9:16, gravar com o modo foto/captura de tela do celular)

1. **"Fui na Paulista… no navegador"**: abre o link, escolhe o lado, o personagem entra na avenida. Legenda: *jogo grátis, sem baixar nada. Link na bio*.
2. **Fogos**: compra/usa fogos de artifício com a avenida cheia. Som ligado. Legenda: *a avenida parou*.
3. **Briga de tomate (PvP)**: ative o PvP e jogue tomates em quem passa. Legenda: *quem lidera a semana?*
4. **Corrida de carros**: largada com contagem e pórticos. Legenda: *a Paulista virou pista*.
5. **Monte seu personagem**: GIF passando pelos 4 passos e terminando com o cartaz. Legenda: *escolhe seu lado*.
6. **Ranking da semana**: print do 🏆 Ranking com o grupo líder. Postar todo domingo.

Dica de edição: o primeiro segundo precisa mostrar movimento (fogos, tomate voando). Texto grande na tela: "JOGO GRÁTIS NO NAVEGADOR".

## Textos prontos

**WhatsApp (grupo de humor/futebol)**
> Gente, achei um jogo online da Avenida Paulista: você escolhe um lado, monta o personagem e sai pela avenida com o povo, joga tomate, faz corrida e solta fogos. É grátis e abre no navegador: https://avenidaonline.com/?src=zap

**X / Twitter**
> Fiz um jogo multiplayer 3D no navegador ambientado na Avenida Paulista. Escolha seu lado, monte o personagem, converse, corra e dispute o ranking semanal entre os grupos. Grátis, sem baixar nada: https://avenidaonline.com/?src=x

**Reddit (r/gamedev, r/WebGames, r/brasil)**
> Título: Avenida Online: jogo multiplayer 3D no navegador (Three.js + WebSocket), sátira da Paulista
> Corpo: contar a stack (Three.js, Node + ws, SQLite), o que foi difícil (sincronização, anti-cheat de movimento, Pix) e pedir feedback. Link com `?src=reddit`. Seguir as regras de autopromoção de cada subreddit antes de postar.

**Mensagem para criadores**
> Oi, [nome]! Fiz um jogo brasileiro multiplayer no navegador (Avenida Online) e acho que combina com seu canal. Não precisa postar nada: se quiser jogar, segue um acesso VIP grátis e o link: https://avenidaonline.com/?src=[nome]. Se gostar, me diga e eu monto um evento com a sua torcida.

## Antes de postar

- Avenida aguenta o pico? Conferir `MAX_PLAYERS` e o consumo da VPS.
- Aviso de "projeto independente, sem vínculo com candidatos ou partidos" visível (já está no menu).
- Não usar rosto nem voz de políticos reais nos vídeos de divulgação.
- Moderação em dia: denúncias, silenciar e filtro de palavras funcionando.

---

# Semana 2 · lançamento nos grupos

## Já está no jogo
- **Convite com recompensa:** logado, 📣 Convidar gera `?lado=...&src=convite&de=SEU_APELIDO`. A cada **3 amigos** que criam conta pelo link (IPs diferentes, e diferente do seu) o anfitrião ganha **3 fogos 🎆**, até 5 prêmios (15 amigos). O anfitrião recebe um aviso na hora, se estiver online.
- **Shows de fogos fixos:** todo dia às **12:00 e 20:00 (Brasília)**, com aviso no jogo 5 e 1 minuto antes. Mude os horários com `SHOW_TIMES=12:00,20:00` no `.env` (vazio desliga). Para puxar um show agora (por exemplo, durante uma live): `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://avenidaonline.com/api/admin/show`.

## Calendário sugerido
| Dia | Ação |
|---|---|
| Seg | Postar o vídeo dos fogos + "show todo dia às 20h" (TikTok, Reels, Shorts) |
| Ter | Post no r/brasil e r/WebGames (autopromoção só onde a regra permitir) |
| Qua | Mensagem aos 20–30 criadores (texto abaixo), com a chave VIP |
| Qui | Puxar um show de fogos ao vivo (endpoint acima) junto com um vídeo ao vivo/stories |
| Sex | Publicar o "ranking da semana" (print do 🏆) e chamar cada torcida para virar o jogo |
| Dom | Repetir o ranking e anunciar o próximo show |

## Textos novos

**Aviso do show (stories / grupo)**
> 🎆 Hoje às 20h tem show de fogos na Avenida Paulista (no jogo). Entra, escolhe teu lado e olha pro céu: https://avenidaonline.com/?src=show

**Convite para o grupo (cola do botão Convidar)**
> Vem pra Paulista! Entra no lado Petista no Avenida Online: https://avenidaonline.com/?lado=petista&src=convite&de=SEUAPELIDO

**Página do itch.io (descrição)**
> Avenida Online é um jogo multiplayer 3D que roda no navegador, ambientado na Avenida Paulista. Escolha seu lado, monte o personagem, converse, jogue tomates (PvP), corra de carro e dispute o ranking semanal entre os grupos. Grátis, sem baixar nada.
> Como jogar: abra o link, escolha o lado e entre. WASD para andar, Espaço para pular, Tab para ver quem está na avenida.
> Link para jogar: https://avenidaonline.com/?src=itch  (o jogo precisa do servidor próprio, então a página do itch.io é só uma vitrine com o link; cadastre como "Link externo/Play in browser at the original site").

## Medir (semana 2)
- `GET /api/admin/stats?days=7`: compare `visit`, `enter` e `share` por origem (`tiktok`, `zap`, `show`, `convite`, o nome de cada criador).
- Meta da semana: 50% dos que abrem o jogo entram na avenida (`enter / visit`) e pelo menos 1 convite com recompensa concluído.
