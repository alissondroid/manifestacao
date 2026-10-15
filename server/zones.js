import { SIDES, ZONES, ZONE } from '../shared/config.js';

// Domínio da Paulista: cada trecho tem dono e uma "força" (0-100). Quem tem mais gente no trecho
// (bandeira vale 2) reduz a força do dono até virar o novo dono; trecho neutro precisa de um acúmulo.
// Cada trecho dominado rende 1 ponto por segundo ao lado.

export function createZones({ players, broadcast }) {
  const zones = ZONES.map((z) => ({
    ...z, owner: -1, prog: 0, claim: -1, claimVal: 0, counts: SIDES.map(() => 0),
  }));
  const scores = SIDES.map(() => 0);
  let last = '';

  const weight = (p) => (p.look.flag === 2 || p.look.equip?.flag ? 2 : 1);

  function tick() {
    const now = Date.now();
    for (const zn of zones) zn.counts.fill(0);
    for (const p of players.values()) {
      if (p.koUntil > now || p.frozen) continue;
      for (const zn of zones) {
        if (Math.abs(p.z - zn.z) <= ZONE.radius) { zn.counts[p.side] += weight(p); break; }
      }
    }
    for (const zn of zones) {
      let best = -1;
      let top = 0;
      let second = 0;
      zn.counts.forEach((c, i) => {
        if (c > top) { second = top; top = c; best = i; } else if (c > second) second = c;
      });
      const lead = top - second;
      if (best >= 0 && lead > 0) {
        const push = ZONE.capture * Math.min(lead, 4);
        if (zn.owner === best) zn.prog = Math.min(100, zn.prog + push);
        else if (zn.owner === -1) {
          if (zn.claim !== best) { zn.claim = best; zn.claimVal = 0; }
          zn.claimVal += push;
          if (zn.claimVal >= ZONE.neutralNeeded) { zn.owner = best; zn.prog = ZONE.startHold; zn.claim = -1; broadcast({ t: 'zonecap', zone: zn.id, side: best }); }
        } else {
          zn.prog -= push;
          if (zn.prog <= 0) { zn.owner = best; zn.prog = ZONE.startHold; broadcast({ t: 'zonecap', zone: zn.id, side: best }); }
        }
      } else if (zn.owner === -1 && zn.claimVal > 0) zn.claimVal = Math.max(0, zn.claimVal - 4);
      if (zn.owner >= 0) scores[zn.owner] += 1;
    }
    const msg = snapshot();
    const key = JSON.stringify(msg);
    if (key !== last) { last = key; broadcast(msg); }
  }

  const snapshot = () => ({
    t: 'zones',
    z: zones.map((zn) => [zn.owner, Math.round(zn.owner === -1 ? zn.claimVal : zn.prog), zn.counts, zn.claim]),
    scores,
  });

  setInterval(tick, ZONE.tickMs);
  return { snapshot };
}
