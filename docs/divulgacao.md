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
