import {
  STAGES, SECOES, PLACES, QUEUE, CIDADES, boundsFor, clampPos, near, mesaria, cabine, queueSpot, room, cidadeDe, personaDe,
} from '../shared/votacao.js';
import { spendMoveBudget, cleanText, uniqueNick } from './rules.js';
import { filterText } from './moderation.js';

// Simulador de votação: sala própria no mesmo servidor. Ninguém aqui vê os jogadores da avenida e vice-versa.
// O servidor guarda só a etapa de cada jogador. O voto na urna NUNCA chega ao servidor.

const MAX_PLAYERS = Number(process.env.VOTO_MAX_PLAYERS) || 80;
const SPEED = Number(process.env.VOTO_SPEED) || 7; // m/s; o teste sobe o limite
const MIN_VOTE_MS = process.env.VOTO_MIN_VOTE_MS !== undefined ? Number(process.env.VOTO_MIN_VOTE_MS) : 8000;
const BIOMETRIA_MS = process.env.VOTO_BIOMETRIA_MS !== undefined ? Number(process.env.VOTO_BIOMETRIA_MS) : 1500;
const ADVANCE_MS = Number(process.env.VOTO_QUEUE_MS) || QUEUE.advanceMs;
const round2 = (v) => Math.round(v * 100) / 100;

/** A fila: posição 0 é a da frente. Cada vaga é um NPC (id negativo) ou o id de um jogador. */
export function createLine(cfg = QUEUE) {
  const entries = [];
  let npcId = 0;
  const npc = () => -(++npcId); // NPCs têm id negativo único: o cliente acompanha cada um andando na fila
  for (let i = 0; i < cfg.npcStart; i += 1) entries.push(npc());
  return {
    entries,
    full: () => entries.length >= cfg.slots,
    /** Quem tem prioridade (idoso, gestante, PcD) entra atrás dos 3 primeiros; os demais vão para o fim. */
    join(id, { prioridade = false } = {}) {
      if (entries.length >= cfg.slots) return -1;
      const at = prioridade ? Math.min(3, entries.length) : entries.length;
      entries.splice(at, 0, id);
      return at;
    },
    leave(id) { const i = entries.indexOf(id); if (i >= 0) entries.splice(i, 1); return i; },
    indexOf: (id) => entries.indexOf(id),
    /** Quem estava na frente sai; chegam novos NPCs para a fila não esvaziar. */
    advance(rand = Math.random) {
      const head = entries.shift();
      const npcs = entries.filter((e) => e < 0).length;
      let add = 0;
      if (npcs < cfg.minNpc) add = cfg.minNpc - npcs;
      else if (entries.length < cfg.slots - 3 && rand() < 0.55) add = 1;
      for (let i = 0; i < add && entries.length < cfg.slots; i += 1) entries.push(npc());
      return head; // os NPCs novos entram no fim, atrás de quem já esperava
    },
  };
}

/** Uma seção por cidade: cada uma com seus eleitores, sua fila e seus mesários. */
function createSala({ cidade, send, cleanLook }) {
  const players = new Map();
  const line = createLine();
  const stats = { votaram: 0 };
  let nextId = 1;

  const all = () => [...players.values()];
  const sendAll = (obj) => { const d = JSON.stringify(obj); for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(d); };
  const notice = (p, text) => send(p.ws, { t: 'notice', text });
  const publicOf = (p) => ({
    id: p.id, nick: p.nick, look: p.look, x: round2(p.x), z: round2(p.z), ry: round2(p.ry), a: p.a, stage: p.stage,
  });

  const lineMsg = () => ({ t: 'line', entries: line.entries });
  function placeInLine() {
    line.entries.forEach((e, idx) => {
      const p = players.get(e);
      if (!p) return;
      const s = queueSpot(idx);
      p.x = s.x; p.z = s.z; p.ry = 0; p.dirty = true;
      send(p.ws, { t: 'tp', x: s.x, z: s.z, ry: 0, soft: true });
    });
  }
  function setStage(p, stage, text) {
    p.stage = stage;
    send(p.ws, {
      t: 'stage', stage, secao: p.secaoIdx >= 0 ? SECOES[p.secaoIdx] : null, sala: p.secaoIdx, docs: p.docs, text: text ?? null,
    });
  }
  const tp = (p, x, z, ry = p.ry) => {
    p.x = x; p.z = z; p.ry = ry; p.dirty = true;
    send(p.ws, { t: 'tp', x, z, ry });
  };

  function advanceLine() {
    const head = line.advance();
    const p = players.get(head);
    if (p) {
      tp(p, PLACES.corridorSpawn.x, PLACES.corridorSpawn.z, 0);
      setStage(p, 'corredor', `Sua vez! Entre na sala da Seção ${SECOES[p.secaoIdx]}.`);
    }
    placeInLine();
    sendAll(lineMsg());
  }
  const queueTimer = setInterval(advanceLine, ADVANCE_MS);
  queueTimer.unref?.();

  function leaveLine(p) {
    if (line.leave(p.id) >= 0) { placeInLine(); sendAll(lineMsg()); }
  }

  function onJoin(ws, m, account) {
    if (ws.voto) return;
    if (players.size >= MAX_PLAYERS) return send(ws, { t: 'denied', reason: 'A seção eleitoral está cheia agora. Tente de novo em instantes.' });
    const id = nextId++;
    let nick = account ? account.nick : filterText(cleanText(m.nick, 16));
    if (!nick) nick = `Eleitor${id}`;
    nick = uniqueNick(nick, all().map((q) => q.nick), 16);
    const persona = personaDe(m.persona);
    const p = {
      id, ws, nick, persona, look: { ...cleanLook(m.look, account), age: persona.look.age }, x: PLACES.spawn.x, z: PLACES.spawn.z, ry: 0, a: 0, dirty: false,
      stage: 'casa', docs: { doc: false, titulo: false, colinha: false }, secaoIdx: -1,
      budget: SPEED, budgetAt: Date.now(), lastChat: 0, mesarioAt: 0, urnaAt: 0, known: new Set(),
    };
    ws.voto = p;
    players.set(id, p);
    send(ws, {
      t: 'welcome', id, x: p.x, z: p.z, ry: 0, stage: p.stage, docs: p.docs, secao: null, nick, cidade: cidade.id, persona: persona.id, dica: persona.dica,
    });
    send(ws, lineMsg());
    sendAll({ t: 'vonline', n: players.size });
  }

  function gateCheck(p) {
    if (p.stage !== 'rua' || p.z < PLACES.gateZ - 0.35 || Math.abs(p.x) > PLACES.gateX) return;
    if (!p.docs.doc) {
      tp(p, 0, PLACES.gateZ - 5, 0);
      notice(p, 'Barrado no portão: sem documento com foto você não vota. Volte para casa e procure o seu.');
      return;
    }
    p.secaoIdx = Math.floor(Math.random() * SECOES.length);
    setStage(p, 'patio', `Bem-vindo! Você vota na Seção ${SECOES[p.secaoIdx]} (sala ${p.secaoIdx + 1}). Entre na fila.`);
  }

  function roomCheck(p) {
    if (p.stage !== 'corredor' || p.z < PLACES.roomZ0 + 0.4) return;
    const i = PLACES.roomX.findIndex((x, k) => p.x >= room(k).x0 && p.x <= room(k).x1);
    if (i < 0) return;
    if (i === p.secaoIdx) setStage(p, 'secao', 'Aproxime-se da mesa dos mesários e apresente seu documento.');
    else {
      tp(p, PLACES.roomX[i], PLACES.roomZ0 - 1.5, Math.PI);
      notice(p, `Essa é a Seção ${SECOES[i]}. A sua é a ${SECOES[p.secaoIdx]}: procure a placa na porta.`);
    }
  }

  function onMove(p, m) {
    if (p.stage === 'fila') return; // na fila, quem mexe no jogador é o servidor
    const x = Number(m.x);
    const z = Number(m.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const now = Date.now();
    if (!spendMoveBudget(p, now, SPEED, Math.hypot(x - p.x, z - p.z))) return;
    const c = clampPos(boundsFor(p.stage, Math.max(0, p.secaoIdx)), x, z);
    p.x = c.x; p.z = c.z;
    p.ry = Number.isFinite(Number(m.ry)) ? Number(m.ry) : p.ry;
    p.a = Math.trunc(Number(m.a)) || 0;
    p.dirty = true;
    if (Math.hypot(c.x - x, c.z - z) > 0.4) send(p.ws, { t: 'tp', x: c.x, z: c.z, ry: p.ry, soft: true });
    gateCheck(p);
    roomCheck(p);
  }

  function onAct(p, id) {
    const now = Date.now();
    const si = Math.max(0, p.secaoIdx);
    switch (id) {
      case 'doc': case 'titulo': case 'colinha': {
        if (!['casa', 'rua'].includes(p.stage) || !near(p, PLACES.mesa)) return notice(p, 'Chegue perto da mesa da sala.');
        const key = id;
        if (p.docs[key]) return;
        p.docs[key] = true;
        send(p.ws, { t: 'docs', docs: p.docs });
        notice(p, { doc: 'Documento com foto no bolso. Sem ele ninguém vota.', titulo: 'Título de eleitor guardado (hoje o documento com foto já basta, e o e-Título vale também).', colinha: 'Colinha anotada: levar os números em papel é permitido. Celular na cabine, não.' }[id]);
        return;
      }
      case 'sair_casa':
        if (p.stage !== 'casa' || !near(p, PLACES.porta)) return notice(p, 'Chegue perto da porta para sair.');
        setStage(p, 'rua', 'Rumo à escola. Siga pela rua até o portão. Lembrou do documento?');
        return;
      case 'panfleto':
        if (!near(p, PLACES.panfleteiro)) return;
        notice(p, 'Boca de urna (pedir ou distribuir voto no dia da eleição) é crime. Recuse o santinho e siga em frente.');
        return;
      case 'fila':
        if (p.stage !== 'patio' || !near(p, PLACES.filaEntrada)) return notice(p, 'A fila começa no pátio, em frente ao prédio.');
        if (line.join(p.id, { prioridade: p.persona.prioridade }) < 0) return notice(p, 'Fila cheia agora. Espere um pouco e tente de novo.');
        setStage(p, 'fila', p.persona.prioridade ? 'Fila preferencial: você tem prioridade e passa na frente de boa parte da fila.' : 'Na fila. Aguarde a sua vez: ela anda sozinha.');
        placeInLine();
        sendAll(lineMsg());
        return;
      case 'sair_fila':
        if (p.stage !== 'fila') return;
        leaveLine(p);
        tp(p, PLACES.filaEntrada.x, PLACES.filaEntrada.z - 2, 0);
        setStage(p, 'patio', 'Você saiu da fila e perdeu a vez.');
        return;
      case 'mesario':
        if (p.stage !== 'secao' || !near(p, mesaria(si))) return notice(p, 'Chegue perto da mesa dos mesários.');
        if (!p.docs.doc) {
          tp(p, PLACES.roomX[si], PLACES.roomZ0 - 1.5, Math.PI);
          setStage(p, 'rua', 'Sem documento com foto não dá para votar. Volte para casa, busque o documento e entre na fila de novo.');
          tp(p, 0, PLACES.gateZ - 5, 0);
          return;
        }
        p.mesarioAt = now;
        send(p.ws, { t: 'mesario', ok: true, ms: BIOMETRIA_MS });
        return;
      case 'biometria':
        if (p.stage !== 'secao' || !p.mesarioAt || now - p.mesarioAt < BIOMETRIA_MS) return notice(p, 'Primeiro apresente o documento ao mesário e mantenha o dedo no leitor.');
        setStage(p, 'habilitado', 'Eleitor habilitado! Vá até a cabine de votação.');
        return;
      case 'cabine':
        if (p.stage !== 'habilitado' || !near(p, cabine(si))) return notice(p, 'Vá até a cabine depois de ser habilitado.');
        p.urnaAt = now;
        setStage(p, 'urna', 'Digite os números e confirme. Seu voto é secreto.');
        return;
      case 'votou':
        if (p.stage !== 'urna' || now - p.urnaAt < MIN_VOTE_MS) return;
        stats.votaram += 1;
        setStage(p, 'votou', 'Voto confirmado! Saia da escola pelo portão.');
        return;
      case 'sair_escola':
        if (p.stage !== 'votou' || !near(p, PLACES.saida)) return notice(p, 'Siga até o portão da escola para sair.');
        setStage(p, 'fim', 'Missão cumprida: você votou! Em 2026 de verdade: leve documento com foto e confira o local no e-Título.');
        return;
      default:
    }
  }

  function onMessage(ws, m, account) {
    if (m.t === 'vjoin') return onJoin(ws, m, account);
    const p = ws.voto;
    if (!p) return;
    if (m.t === 'move') onMove(p, m);
    else if (m.t === 'act' && typeof m.id === 'string') onAct(p, m.id);
    else if (m.t === 'chat') {
      const now = Date.now();
      if (now - p.lastChat < 1200) return;
      const text = filterText(cleanText(m.text, 140));
      if (!text) return;
      p.lastChat = now;
      sendAll({ t: 'chat', id: p.id, nick: p.nick, text });
    }
  }

  function onClose(ws) {
    const p = ws.voto;
    if (!p) return;
    leaveLine(p);
    players.delete(p.id);
    ws.voto = null;
    sendAll({ t: 'vonline', n: players.size });
  }

  // sincronização a 10 Hz: a seção é pequena, todo mundo vê todo mundo
  const syncTimer = setInterval(() => {
    for (const p of players.values()) {
      if (p.ws.readyState !== 1) continue;
      if (p.ws.bufferedAmount > 512 * 1024) { p.ws.terminate(); continue; }
      const add = []; const del = []; const s = [];
      for (const q of players.values()) {
        if (q === p) continue;
        if (!p.known.has(q.id)) { p.known.add(q.id); add.push(publicOf(q)); } else if (q.dirty) s.push([q.id, round2(q.x), round2(q.z), round2(q.ry), q.a]);
      }
      for (const id of p.known) if (!players.has(id)) { p.known.delete(id); del.push(id); }
      if (add.length || del.length || s.length) p.ws.send(JSON.stringify({ t: 'sync', add, del, s }));
    }
    for (const p of players.values()) p.dirty = false;
  }, 100);
  syncTimer.unref?.();

  return {
    onMessage, onClose, stats, stages: STAGES, count: () => players.size,
    stop() { clearInterval(queueTimer); clearInterval(syncTimer); },
  };
}

export function createVotacao({ send, cleanLook }) {
  const salas = new Map(CIDADES.map((c) => [c.id, createSala({ cidade: c, send, cleanLook })]));
  return {
    onMessage(ws, m, account) {
      if (m.t === 'vjoin') {
        if (ws.sala) return;
        ws.sala = salas.get(cidadeDe(m.cidade).id);
      }
      ws.sala?.onMessage(ws, m, account);
    },
    onClose(ws) { ws.sala?.onClose(ws); ws.sala = null; },
    get stats() { return { votaram: [...salas.values()].reduce((n, s) => n + s.stats.votaram, 0) }; },
    count: () => [...salas.values()].reduce((n, s) => n + s.count(), 0),
    stop() { for (const s of salas.values()) s.stop(); },
  };
}
