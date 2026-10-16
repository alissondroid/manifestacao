import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  WORLD, SIDES, SHIRTS, SKINS, HAIRS, HAIR_STYLES, BODIES, AGES, MODELS, HEIGHTS, BEARDS, TOPS, PANTS, FLAGS, ANIMS, MAX_SPEED, LIMITS, MELEE, VEHICLE, COMBAT, REACTIONS, PREMIUM_ANIMS, BILLBOARD,
} from '../shared/config.js';
import { handleApi } from './api.js';
import { userFromRequest, nickTaken } from './auth.js';
import {
  equippedMap, designsOf, hasPremiumEmotes, inventoryOf, spend,
} from './shop.js';
import { filterText } from './moderation.js';
import { createRace } from './race.js';
import { PVP } from '../shared/config.js';
import { createZones } from './zones.js';
import { clientIp } from './ip.js';
import { GOOGLE_CLIENT_ID } from './google.js';
import {
  cleanText, isReservedNick, uniqueNick, spendMoveBudget, diagnoseMiss,
} from './rules.js';
import { db } from './db.js';
import { REPORT, recordChat, fileReport } from './reports.js';
import { isBanned, keysOf } from './bans.js';

process.on('uncaughtException', (err) => console.error('[erro não tratado]', err));
process.on('unhandledRejection', (err) => console.error('[promessa rejeitada]', err));

const PROD = process.env.NODE_ENV === 'production';
const TRUST_PROXY = process.env.TRUST_PROXY === '1'; // só confie em X-Forwarded-* atrás de um proxy seu
const MAX_SPECTATORS = Number(process.env.MAX_SPECTATORS) || 100;
const PORT = Number(process.env.PORT) || 8787;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 300;
const MAX_PER_IP = Number(process.env.MAX_PER_IP) || 5;
const AOI = Number(process.env.AOI) || 70; // raio de interesse em metros
const AOI_EXIT = 10;
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

// ---------- HTTP estático (produção) ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// Cabeçalhos de segurança das páginas e arquivos estáticos. A CSP só vale para HTML.
const GSI = GOOGLE_CLIENT_ID ? 'https://accounts.google.com/gsi/' : ''; // botão "Entrar com o Google"
const CSP = [
  "default-src 'self'",
  `script-src 'self'${GSI ? ` ${GSI}client` : ''}`,
  `style-src 'self' 'unsafe-inline'${GSI ? ` ${GSI}style` : ''}`, // o cliente usa style="..." em elementos criados por script
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ws: wss: data: blob:${GSI ? ` ${GSI}` : ''}`,
  ...(GSI ? [`frame-src ${GSI}`] : []),
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
const HSTS = PROD && (process.env.PUBLIC_URL || '').startsWith('https');
function securityHeaders(isHtml) {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    ...(isHtml ? { 'content-security-policy': CSP } : {}),
    ...(HSTS ? { 'strict-transport-security': 'max-age=31536000' } : {}),
  };
}

const server = http.createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (err) {
    console.error('[http]', err);
    if (!res.headersSent) res.writeHead(400);
    res.end();
  }
});

async function handle(req, res) {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, players: players.size, uptime: Math.round(process.uptime()) }));
  }
  if (await handleApi(req, res, { onEquip: refreshLook, onDelete: kickUser, onBan: kickBanned })) return;
  if (!fs.existsSync(DIST)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Sem build. Em desenvolvimento use "npm run dev" (cliente em http://localhost:5173).');
  }
  let file;
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    const decoded = decodeURIComponent(pathname);
    if (decoded.includes('\0')) throw new Error('nul');
    file = path.join(DIST, path.normalize(decoded));
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (file !== DIST && !file.startsWith(DIST + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  const dirIndex = path.join(file, 'index.html');
  if (file !== DIST && fs.existsSync(dirIndex)) file = dirIndex; // /termos -> /termos/index.html
  fs.stat(file, (err, st) => {
    if (err || st.isDirectory()) {
      // só a página inicial existe; qualquer outro caminho é 404 de verdade (não "soft 404" para os buscadores)
      if (new URL(req.url, 'http://localhost').pathname !== '/') {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Página não encontrada. Volte para https://avenidaonline.com/');
      }
      file = path.join(DIST, 'index.html');
    }
    const inAssets = file.includes(`${path.sep}assets${path.sep}`);
    const cache = file.endsWith('index.html') ? 'no-cache'
      : inAssets ? 'public, max-age=31536000, immutable'
        : 'public, max-age=86400';
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': cache,
      ...securityHeaders(file.endsWith('.html')),
    });
    fs.createReadStream(file).on('error', () => res.end()).pipe(res);
  });
}

// ---------- Estado e validação ----------

// Em produção o WebSocket só aceita a própria origem (ou as de ALLOWED_ORIGINS, separadas por vírgula).
const allowedHosts = new Set([
  ...(process.env.PUBLIC_URL ? [new URL(process.env.PUBLIC_URL).host] : []),
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => { try { return new URL(o).host; } catch { return o; } }),
]);
function originOk(req) {
  if (!PROD) return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  let host;
  try { host = new URL(origin).host; } catch { return false; }
  return host === req.headers.host || (TRUST_PROXY && host === req.headers['x-forwarded-host']) || allowedHosts.has(host);
}
const wss = new WebSocketServer({
  server, path: '/ws', maxPayload: 2048, verifyClient: ({ req }) => originOk(req),
});
const players = new Map();
const perIp = new Map();
let nextId = 1;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v, max) => clamp(Math.trunc(Number(v)) || 0, 0, max);
const round2 = (v) => Math.round(v * 100) / 100;


// `equip` e `custom` vêm do banco (itens comprados e desenhos), nunca do cliente.
function cleanLook(rawLook, equip = {}, custom = {}) {
  const look = rawLook && typeof rawLook === 'object' ? rawLook : {};
  const body = int(look.body, BODIES.length - 1);
  return {
    body,
    age: int(look.age, AGES.length - 1),
    face: int(look.face, MODELS[body === 1 ? 'female' : 'male'].length - 1),
    height: int(look.height, HEIGHTS.length - 1),
    skin: int(look.skin, SKINS.length - 1),
    hairStyle: int(look.hairStyle, HAIR_STYLES.length - 1),
    hair: int(look.hair, HAIRS.length - 1),
    beard: body === 0 ? int(look.beard, BEARDS.length - 1) : 0,
    shirt: int(look.shirt, SHIRTS.length - 1),
    top: int(look.top, TOPS.length - 1),
    pants: int(look.pants, PANTS.length - 1),
    flag: int(look.flag, FLAGS.length - 1),
    sign: filterText(cleanText(look.sign, LIMITS.sign)),
    equip,
    custom,
  };
}

/** Conta excluída: tira o jogador da avenida. */
function kickUser(userId) {
  for (const p of [...players.values()]) {
    if (p.userId !== userId) continue;
    p.ws.close(4001, 'Conta excluída');
    removePlayer(p);
  }
}

/** Banimento novo: derruba quem estiver online com essa chave (conta `u12` ou IP `ip:...`). */
function kickBanned(key) {
  for (const ws of wss.clients) {
    const keys = keysOf({ ip: ws.ip, userId: ws.user?.id });
    if (!keys.includes(key)) continue;
    if (ws.player) removePlayer(ws.player);
    ws.close(4003, 'Banido');
  }
}

/** Itens equipados mudaram na loja: atualiza o avatar de quem está online e avisa quem o vê. */
function refreshLook(userId) {
  for (const p of players.values()) {
    if (p.userId !== userId) continue;
    p.look = { ...p.look, equip: equippedMap(userId), custom: designsOf(userId) };
    p.premium = hasPremiumEmotes(userId);
    send(p.ws, { t: 'inv', inv: inventoryOf(userId), premium: p.premium });
    const msg = JSON.stringify({ t: 'look', id: p.id, look: p.look });
    for (const ws of wss.clients) {
      if (ws.readyState === ws.OPEN && ws.joined && (ws.player === p || ws.known.has(p.id))) ws.send(msg);
    }
  }
}

const publicPlayer = (p) => ({
  id: p.id, nick: p.nick, side: p.side, look: p.look, x: round2(p.x), z: round2(p.z), ry: round2(p.ry), a: p.a,
});

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

// Por padrão só quem já entrou na avenida recebe; `everyone` inclui o lobby.
function broadcast(obj, exceptWs, everyone = false) {
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client === exceptWs || client.readyState !== client.OPEN) continue;
    if (everyone || client.joined) client.send(data);
  }
}

// Últimas mensagens do chat: quem entra vê o contexto da conversa.
const chatLog = [];
const HISTORY_MS = 10 * 60_000;

function onlineCounts() {
  const counts = SIDES.map(() => 0);
  for (const p of players.values()) counts[p.side] += 1;
  return counts;
}

// ---------- Corrida ----------

function teleport(p, x, z, ry) {
  p.x = x;
  p.z = z;
  p.ry = ry;
  p.dirty = true;
  p.lastMove = Date.now();
  p.budgetAt = p.lastMove;
  p.budget = MAX_SPEED; // folga para o cliente se acertar na nova posição
  send(p.ws, { t: 'fix', x: round2(x), z: round2(z), ry });
}

const race = createRace({ players, send, broadcast: (msg) => broadcast(msg), teleport });

const zones = createZones({ players, broadcast: (msg) => broadcast(msg) });

// ---------- PvP: tomatada ----------
// O arremesso é resolvido no servidor pela posição e direção do jogador: o tomate voa em linha
// reta até PVP.range e acerta o primeiro jogador (com PvP ligado) a menos de PVP.radius da linha.

const sideScores = SIDES.map(() => 0);
function pvpScores() {
  const top = [...players.values()].filter((p) => p.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 5)
    .map((p) => ({ nick: p.nick, side: p.side, hits: p.hits, kos: p.kos }));
  return { t: 'pvp', scores: sideScores, top };
}

function sendNear(p, msg) {
  const data = JSON.stringify(msg);
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN && ws.joined && (ws.player === p || ws.known.has(p.id))) ws.send(data);
  }
}

const spawnPoint = () => [(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 10];

function announceHp(p) {
  const now = Date.now();
  sendNear(p, {
    t: 'hp', id: p.id, hp: Math.round(p.hp), sh: Math.max(0, p.shieldUntil - now), ko: Math.max(0, p.koUntil - now),
  });
}

const protectedNow = (p, now) => p.koUntil > now || p.shieldUntil > now;

/** Tira vida do alvo; a zero, nocauteia (some do jogo por um tempo e volta protegido). */
function damage(target, attacker, kind) {
  const now = Date.now();
  target.hp = Math.max(0, target.hp - COMBAT.dmg[kind]);
  target.lastHurt = now;
  if (target.hp <= 0) {
    target.koUntil = now + COMBAT.koMs;
    target.stunUntil = target.koUntil;
    attacker.kos += 1;
    sideScores[attacker.side] += COMBAT.koBonus;
    send(target.ws, { t: 'ko', by: attacker.nick, ms: COMBAT.koMs });
    broadcast({ t: 'feed', a: attacker.nick, as: attacker.side, v: target.nick, vs: target.side, k: kind });
  }
  announceHp(target);
}

/** A cada meio segundo: devolve quem terminou o nocaute e regenera a vida de quem não apanha há um tempo. */
setInterval(() => {
  const now = Date.now();
  for (const p of players.values()) {
    if (p.hp <= 0 && p.koUntil <= now) {
      p.hp = COMBAT.hp;
      p.shieldUntil = now + COMBAT.shieldMs;
      const [x, z] = spawnPoint();
      teleport(p, x, z, 0);
      announceHp(p);
    } else if (p.hp > 0 && p.hp < COMBAT.hp && now - p.lastHurt > COMBAT.regenDelayMs) {
      p.hp = Math.min(COMBAT.hp, p.hp + COMBAT.regenPerSec / 2);
      announceHp(p);
    }
  }
}, 500);

function throwTomato(me) {
  const now = Date.now();
  if (!me.pvp || me.koUntil > now || now - me.lastThrow < PVP.cooldownMs) return;
  me.lastThrow = now;
  const dx = Math.sin(me.ry);
  const dz = Math.cos(me.ry);
  let target = null;
  let best = PVP.range;
  for (const p of players.values()) {
    if (p === me || !p.pvp || protectedNow(p, Date.now())) continue;
    const ox = p.x - me.x;
    const oz = p.z - me.z;
    const along = ox * dx + oz * dz;
    if (along < 0.5 || along > best) continue;
    const lateral = Math.abs(ox * dz - oz * dx);
    if (lateral > PVP.radius) continue;
    best = along;
    target = p;
  }
  if (target) {
    me.hits += 1;
    sideScores[me.side] += 1;
    damage(target, me, 'tomato');
  }
  sendNear(me, {
    t: 'throw', id: me.id, x: round2(me.x), z: round2(me.z), ry: round2(me.ry), dist: round2(best), hit: target ? target.id : null,
  });
  if (target) {
    send(target.ws, { t: 'hitby', id: me.id, nick: me.nick, hp: Math.round(target.hp) });
    broadcast(pvpScores());
  }
}

// ---------- PvP: golpes corpo a corpo e atropelamento ----------
// O alvo é o jogador (com PvP ligado) mais perto dentro do alcance e do arco à frente do atacante.
// Quem leva o golpe é empurrado e fica atordoado (não anda) por alguns instantes.

const DRIVE = ANIMS.indexOf('drive');
function hitTarget(me, kind, pushDir) {
  const spec = MELEE[kind];
  const now = Date.now();
  let target = null;
  let best = spec.reach;
  for (const p of players.values()) {
    if (p === me || !p.pvp || protectedNow(p, now)) continue;
    const ox = p.x - me.x;
    const oz = p.z - me.z;
    const d = Math.hypot(ox, oz);
    if (d > best || d < 0.05) continue;
    const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(ox, oz) - me.ry), Math.cos(Math.atan2(ox, oz) - me.ry)));
    if (ang > spec.arc) continue;
    if (kind === 'car' && now - (p.lastRunOver || 0) < spec.cooldownMs) continue;
    best = d;
    target = p;
  }
  if (!target) return null;
  const dx = pushDir ? pushDir[0] : Math.sin(me.ry);
  const dz = pushDir ? pushDir[1] : Math.cos(me.ry);
  const nx = clamp(target.x + dx * spec.push, -WORLD.halfWidth, WORLD.halfWidth);
  const nz = clamp(target.z + dz * spec.push, -WORLD.halfLength, WORLD.halfLength);
  target.stunUntil = now + spec.stunMs;
  if (kind === 'car') target.lastRunOver = now;
  teleport(target, nx, nz, target.ry);
  me.hits += 1;
  sideScores[me.side] += 1;
  damage(target, me, kind);
  send(target.ws, { t: 'hitby', id: me.id, nick: me.nick, kind, hp: Math.round(target.hp) });
  broadcast(pvpScores());
  return target;
}

function attack(me, kind) {
  if (!Object.hasOwn(MELEE, kind) || kind === 'car' || me.a === DRIVE) return;
  const now = Date.now();
  if (me.koUntil > now || now - (me.lastAttack || 0) < MELEE[kind].cooldownMs) return;
  me.lastAttack = now;
  const target = me.pvp ? hitTarget(me, kind) : null;
  sendNear(me, { t: 'attack', id: me.id, kind, hit: target ? target.id : null });
  if (!target && now - me.lastHint > 3000) { // errou: explica por quê (PvP desligado, longe demais, de costas...), no máximo a cada 3 s
    const why = diagnoseMiss(me, [...players.values()].filter((p) => p !== me), MELEE[kind], now);
    if (why) { me.lastHint = now; notice(me, why.text); }
  }
}

// ---------- Itens consumíveis (comprados na loja) ----------

const notice = (p, text) => send(p.ws, { t: 'notice', text });
/** Identifica a pessoa (conta ou IP) para contar denunciantes diferentes. */
const playerKey = (p) => (p.userId ? `u${p.userId}` : `ip:${p.ip}`);
const stock = (p) => send(p.ws, { t: 'inv', inv: inventoryOf(p.userId), premium: p.premium });

/** Fogos de artifício sobre o jogador, visíveis a quem está por perto. Consome 1 unidade. */
function useFireworks(me) {
  const now = Date.now();
  if (!me.userId) return notice(me, 'Entre numa conta para usar itens da loja.');
  if (me.koUntil > now) return;
  if (now - me.lastUse < 4000) return notice(me, 'Espere um pouco para soltar outro.');
  if (!spend(me.userId, 'fogos')) return notice(me, 'Você não tem fogos. Compre na loja 🛍️.');
  me.lastUse = now;
  sendNear(me, { t: 'fx', k: 'fogos', x: round2(me.x), z: round2(me.z), side: me.side });
  stock(me);
}

let lastBillboard = 0;
/** Mensagem no telão: aparece no telão da avenida e no topo da tela de todos. Consome 1 unidade só se for ao ar. */
function billboard(me, raw) {
  const now = Date.now();
  if (!me.userId) return notice(me, 'Entre numa conta para usar o telão.');
  const text = cleanText(raw, BILLBOARD.max);
  if (!text) return notice(me, 'Escreva depois do comando: /telao seu texto');
  if (now - lastBillboard < BILLBOARD.cooldownMs) return notice(me, 'O telão está ocupado. Tente em instantes.');
  if (!spend(me.userId, 'telao')) return notice(me, 'Você não tem mensagens de telão. Compre na loja 🛍️.');
  lastBillboard = now;
  broadcast({ t: 'billboard', nick: me.nick, side: me.side, text });
  stock(me);
}

/** Tira o jogador do jogo (quem o conhecia recebe `del` no próximo ciclo de sincronização). */
function removePlayer(p) {
  race.onLeave(p);
  players.delete(p.id);
  broadcast({ t: 'online', counts: onlineCounts() }, null, true);
}

// ---------- Conexões ----------

wss.on('connection', (ws, req) => {
  const ip = clientIp(req);
  ws.ip = ip;
  ws.user = userFromRequest(req);
  if (isBanned(keysOf({ ip, userId: ws.user?.id }))) return ws.close(4003, 'Banido');
  const open = perIp.get(ip) || 0;
  if (open >= MAX_PER_IP) return ws.close(1008, 'Muitas conexões');
  perIp.set(ip, open + 1);

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  send(ws, { t: 'online', counts: onlineCounts() });

  let me = null;
  let tokens = 60; // limite de mensagens: 40/s com rajada de 60
  let refillAt = Date.now();

  ws.on('message', (raw) => {
    try {
      const now = Date.now();
      tokens = Math.min(60, tokens + ((now - refillAt) / 1000) * 40);
      refillAt = now;
      if (tokens < 1) return;
      tokens -= 1;
      onMessage(raw);
    } catch (err) {
      console.error('[ws]', err);
    }
  });

  function onMessage(raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    // Modo "só assistir": recebe o mundo inteiro, sem avatar e sem chat.
    if (m.t === 'watch') {
      if (ws.joined) return;
      const watching = [...wss.clients].filter((c) => c.joined && !c.player).length;
      if (watching >= MAX_SPECTATORS) return send(ws, { t: 'denied', reason: 'Muitos espectadores no momento. Tente entrar na avenida.' });
      ws.joined = true;
      ws.player = null;
      ws.known = new Set();
      send(ws, { t: 'welcome', id: 0, spectator: true, x: 0, z: 0 });
      send(ws, zones.snapshot());
      return;
    }

    if (m.t === 'join') {
      if (ws.joined || players.size >= MAX_PLAYERS) return;
      const id = nextId++;
      const account = ws.user; // definido no upgrade pelo cookie de sessão
      let nick = account ? account.nick : filterText(cleanText(m.nick, LIMITS.nick));
      if (!account && (!nick || isReservedNick(nick))) nick = `Visitante${id}`;
      if (!account) nick = uniqueNick(nick, [...players.values()].map((q) => q.nick), LIMITS.nick);
      if (!account && nickTaken(nick)) {
        return send(ws, { t: 'denied', reason: 'Esse apelido pertence a uma conta. Escolha outro ou entre na conta.' });
      }
      if (account) { // a mesma conta entrando de novo (reconexão ou outra aba): a sessão antiga cai
        for (const old of [...players.values()]) {
          if (old.userId !== account.id) continue;
          old.ws.close(4000, 'Entrou em outro lugar');
          removePlayer(old);
        }
      }
      me = {
        id,
        ws,
        userId: account?.id ?? null,
        nick,
        side: int(m.side, SIDES.length - 1),
        look: cleanLook(m.look, account ? equippedMap(account.id) : {}, account ? designsOf(account.id) : {}),
        x: 0,
        z: 0,
        ry: 0,
        a: 0,
        dirty: false,
        lastMove: Date.now(),
        budgetAt: Date.now(),
        budget: MAX_SPEED,
        lastChat: 0,
        frozen: false, // na largada da corrida
        pvp: false,
        lastThrow: 0,
        lastAttack: 0,
        stunUntil: 0,
        lastRunOver: 0,
        hits: 0,
        kos: 0,
        hp: COMBAT.hp,
        lastHurt: 0,
        koUntil: 0,
        shieldUntil: 0,
        lastReact: 0,
        lastWho: 0,
        mutedUntil: 0,
        lastHint: 0,
        ip,
        lastUse: 0,
        premium: account ? hasPremiumEmotes(account.id) : false,
      };
      [me.x, me.z] = spawnPoint();
      players.set(id, me);
      ws.joined = true;
      ws.player = me;
      ws.known = new Set();
      // quem está por perto chega no próximo ciclo de sincronização (≤100 ms)
      send(ws, { t: 'welcome', id, x: round2(me.x), z: round2(me.z) });
      send(ws, race.snapshot());
      send(ws, pvpScores());
      send(ws, zones.snapshot());
      const recent = chatLog.filter((c) => Date.now() - c.at < HISTORY_MS).slice(-12);
      if (recent.length) send(ws, { t: 'history', list: recent.map((c) => [c.nick, c.side, c.text]) });
      if (me.userId) stock(me);
      broadcast({ t: 'online', counts: onlineCounts() }, null, true);
      return;
    }

    if (!me) return;

    if (m.t === 'move') {
      const now = Date.now();
      const dt = clamp((now - me.lastMove) / 1000, 0.02, 1);
      const x = num(m.x);
      const z = num(m.z);
      const ry = num(m.ry);
      if (x === null || z === null || ry === null) return;
      if (me.frozen || me.stunUntil > now) return send(ws, { t: 'fix', x: round2(me.x), z: round2(me.z) });
      if (!Number.isFinite(me.x + me.z)) return;
      const nx = clamp(x, -WORLD.halfWidth, WORLD.halfWidth);
      const nz = clamp(z, -WORLD.halfLength, WORLD.halfLength);
      let a = int(m.a, ANIMS.length - 1);
      if (PREMIUM_ANIMS.includes(a) && !me.premium) a = 0; // gesto premium sem direito: fica parado
      const limit = a === DRIVE ? VEHICLE.maxSpeed : MAX_SPEED;
      if (!spendMoveBudget(me, now, limit, Math.hypot(nx - me.x, nz - me.z))) {
        // movimento impossível (acima da velocidade permitida): devolve a posição aceita
        send(ws, { t: 'fix', x: round2(me.x), z: round2(me.z) });
        return;
      }
      const vx = (nx - me.x) / dt;
      const vz = (nz - me.z) / dt;
      me.lastMove = now;
      me.x = nx;
      me.z = nz;
      me.ry = ry;
      me.a = a;
      me.dirty = true;
      race.onMove(me);
      // de carro e com o PvP ligado: atropela quem estiver na frente
      if (a === DRIVE && me.pvp && Math.hypot(vx, vz) >= VEHICLE.minHitSpeed) {
        const sp = Math.hypot(vx, vz);
        const target = hitTarget(me, 'car', [vx / sp, vz / sp]);
        if (target) sendNear(me, { t: 'attack', id: me.id, kind: 'car', hit: target.id });
      }
    } else if (m.t === 'chat') {
      const now = Date.now();
      if (now - me.lastChat < LIMITS.chatCooldownMs) return;
      const text = filterText(cleanText(m.text, LIMITS.chat));
      if (!text) return;
      me.lastChat = now;
      if (me.mutedUntil > now) return notice(me, `Você está silenciado por mais ${Math.ceil((me.mutedUntil - now) / 60000)} min após denúncias de outros jogadores.`);
      if (/^\/telao(\s|$)/i.test(text)) return billboard(me, text.replace(/^\/telao\s*/i, ''));
      if (/^\/fogos\b/i.test(text)) return useFireworks(me);
      if (/^\/ajuda\b/i.test(text)) return notice(me, 'Comandos: /telao <texto> (gasta 1 mensagem de telão), /fogos (gasta 1 fogos) e /ajuda. Toque no nome de alguém para silenciar ou denunciar.');
      recordChat(playerKey(me), me.nick, text, now);
      chatLog.push({ nick: me.nick, side: me.side, text, at: now });
      if (chatLog.length > 30) chatLog.shift();
      broadcast({ t: 'chat', id: me.id, nick: me.nick, side: me.side, text });
    } else if (m.t === 'report') {
      const target = players.get(Math.trunc(Number(m.id)));
      if (!target || target === me) return;
      const res = fileReport({ key: playerKey(me), nick: me.nick }, { key: playerKey(target), nick: target.nick });
      if (!res.ok) return notice(me, res.reason);
      if (res.mute && target.mutedUntil < Date.now()) {
        target.mutedUntil = Date.now() + REPORT.muteMs;
        notice(target, 'Você foi silenciado por alguns minutos após denúncias de outros jogadores.');
      }
      notice(me, 'Denúncia enviada. Obrigado por ajudar a manter a avenida legal.');
    } else if (m.t === 'race') {
      if (m.action === 'join') race.join(me);
      else if (m.action === 'leave') race.leave(me);
    } else if (m.t === 'pvp') {
      const on = !!m.on;
      const now = Date.now();
      if (!on && me.pvp && (now - me.lastHurt < COMBAT.leaveLockMs || me.koUntil > now)) {
        return send(ws, { t: 'pvp', on: true, locked: true });
      }
      me.pvp = on;
      if (!on) { me.hp = COMBAT.hp; me.shieldUntil = 0; announceHp(me); }
      send(ws, { t: 'pvp', on: me.pvp });
    } else if (m.t === 'use') {
      if (m.item === 'fogos') useFireworks(me);
    } else if (m.t === 'react') {
      const e = Math.trunc(Number(m.e));
      const now = Date.now();
      if (!(e >= 0 && e < REACTIONS.length) || now - me.lastReact < 800) return;
      me.lastReact = now;
      sendNear(me, { t: 'react', id: me.id, e });
    } else if (m.t === 'who') {
      const now = Date.now();
      if (now - me.lastWho < 1500) return;
      me.lastWho = now;
      const list = [...players.values()].sort((a, b) => b.hits - a.hits || b.kos - a.kos).slice(0, 80)
        .map((p) => [p.nick, p.side, p.hits, p.kos, p.id]);
      send(ws, { t: 'who', list, total: players.size });
    } else if (m.t === 'throw') {
      throwTomato(me);
    } else if (m.t === 'attack') {
      attack(me, String(m.kind));
    }
  }

  ws.on('close', () => {
    perIp.set(ip, Math.max(0, (perIp.get(ip) || 1) - 1));
    if (me && players.get(me.id) === me) removePlayer(me);
  });
  ws.on('error', () => {});
});

// ---------- Loops ----------

// Sincronização a 10 Hz com interesse por área: cada cliente só recebe quem está
// dentro de AOI metros (com histerese na saída) e só posições que mudaram.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.joined || ws.readyState !== ws.OPEN) continue;
    if (ws.bufferedAmount > 512 * 1024) { ws.terminate(); continue; } // cliente que não acompanha
    const vp = ws.player; // null = espectador (vê todos)
    const add = [];
    const del = [];
    const s = [];

    for (const p of players.values()) {
      if (p === vp) continue;
      const known = ws.known.has(p.id);
      const near = !vp || Math.hypot(p.x - vp.x, p.z - vp.z) <= (known ? AOI + AOI_EXIT : AOI);
      if (near && !known) { ws.known.add(p.id); add.push(publicPlayer(p)); }
      else if (near && p.dirty) s.push([p.id, round2(p.x), round2(p.z), round2(p.ry), p.a]);
      else if (!near && known) { ws.known.delete(p.id); del.push(p.id); }
    }
    for (const id of ws.known) {
      if (!players.has(id)) { ws.known.delete(id); del.push(id); }
    }

    if (add.length || del.length || s.length) ws.send(JSON.stringify({ t: 'sync', add, del, s }));
  }
  for (const p of players.values()) p.dirty = false;
}, 100);

// Derruba conexões mortas.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, Math.max(100, Number(process.env.HEARTBEAT_MS) || 10000));

server.listen(PORT, () => {
  console.log(`Servidor em http://localhost:${PORT}  (WebSocket em /ws)`);
});

// Desligamento limpo: avisa os clientes (que reconectam sozinhos), fecha o HTTP e o banco.
let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[${signal}] encerrando...`);
  for (const ws of wss.clients) ws.close(1001, 'Servidor reiniciando');
  server.close(() => {
    try { db.close(); } catch { /* já fechado */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
