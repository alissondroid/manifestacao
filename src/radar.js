import { WORLD, SIDES, ZONES, ZONE, RACE } from '../shared/config.js';

const $ = (s) => document.querySelector(s);
const W = 240;
const H = 62;
const PAD_TOP = 6;
const PAD_BOT = 14;

/** Minimapa da avenida (faixa horizontal, z da esquerda para a direita) e painel do Domínio. */
export function initRadar() {
  const canvas = $('#radarmap');
  const ctx = canvas.getContext('2d');
  const ratio = 2;
  canvas.width = W * ratio;
  canvas.height = H * ratio;
  ctx.scale(ratio, ratio);
  const info = $('#zoneinfo');
  const score = $('#domscore');
  let zones = ZONES.map(() => ({ owner: -1, prog: 0, counts: SIDES.map(() => 0), claim: -1 }));
  let scores = SIDES.map(() => 0);
  let nextDraw = 0;
  let infoKey = '';

  const px = (z) => ((z + WORLD.halfLength) / (WORLD.halfLength * 2)) * W;
  const py = (x) => PAD_TOP + ((x + WORLD.halfWidth) / (WORLD.halfWidth * 2)) * (H - PAD_TOP - PAD_BOT);

  function paintScore() {
    const total = scores.reduce((a, b) => a + b, 0) || 1;
    score.innerHTML = `<small>Domínio</small>${SIDES.map((s, i) => `<span title="${s.name}"><i style="background:${s.color}"></i>${scores[i]}</span>`).join('')}`
      + `<div class="share">${SIDES.map((s, i) => `<b style="background:${s.color};flex:${scores[i] / total}"></b>`).join('')}</div>`;
  }
  paintScore();

  function draw(me, remotes, watching) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(30,34,38,0.85)';
    ctx.fillRect(0, PAD_TOP, W, H - PAD_TOP - PAD_BOT);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, py(-5), W, py(5) - py(-5)); // pista
    ZONES.forEach((z, i) => {
      const st = zones[i];
      const x0 = px(z.z - ZONE.radius);
      const x1 = px(z.z + ZONE.radius);
      if (st.owner >= 0) {
        ctx.globalAlpha = 0.25 + 0.4 * (st.prog / 100);
        ctx.fillStyle = SIDES[st.owner].color;
      } else {
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = '#ffffff';
      }
      ctx.fillRect(x0, PAD_TOP, x1 - x0, H - PAD_TOP - PAD_BOT);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.strokeRect(x0 + 0.5, PAD_TOP + 0.5, x1 - x0 - 1, H - PAD_TOP - PAD_BOT - 1);
      ctx.fillStyle = 'rgba(241,245,249,0.8)';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(z.tag, (x0 + x1) / 2, H - 3);
    });
    ctx.fillStyle = '#facc15'; // largada e chegada da corrida
    ctx.fillRect(px(RACE.startZ) - 0.5, PAD_TOP, 1, H - PAD_TOP - PAD_BOT);
    ctx.fillRect(px(RACE.finishZ) - 0.5, PAD_TOP, 1, H - PAD_TOP - PAD_BOT);
    for (const r of remotes.values()) {
      ctx.fillStyle = SIDES[r.side].color;
      ctx.beginPath();
      ctx.arc(px(r.z), py(r.x), 2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!watching) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px(me.z), py(me.x), 3.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
    }
  }

  function setInfo(me, watching) {
    const i = ZONES.findIndex((z) => Math.abs(me.z - z.z) <= ZONE.radius);
    let html = '';
    if (watching) html = 'Modo assistir';
    else if (i < 0) html = '📍 Fora dos trechos · vá para um trecho para disputar';
    else {
      const st = zones[i];
      const name = ZONES[i].name;
      if (st.owner >= 0) html = `📍 <b>${name}</b> · ${SIDES[st.owner].short} ${st.prog}%`;
      else if (st.claim >= 0 && st.prog > 0) html = `📍 <b>${name}</b> · ${SIDES[st.claim].short} tomando ${Math.round((st.prog / ZONE.neutralNeeded) * 100)}%`;
      else html = `📍 <b>${name}</b> · sem dono`;
    }
    if (html !== infoKey) { info.innerHTML = html; infoKey = html; }
  }

  return {
    setZones(m) {
      zones = m.z.map(([owner, prog, counts, claim]) => ({ owner, prog, counts, claim }));
      scores = m.scores;
      paintScore();
    },
    zoneName: (id) => ZONES[id]?.name ?? '',
    update(now, me, remotes, watching) {
      if (now < nextDraw) return;
      nextDraw = now + 120;
      draw(me, remotes, watching);
      setInfo(me, watching);
    },
  };
}
