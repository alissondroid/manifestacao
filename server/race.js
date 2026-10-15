import { db } from './db.js';
import { RACE } from '../shared/config.js';

// Modo corrida: quem entra espera outros corredores, vai para a largada, conta 3-2-1 e corre
// até a linha de chegada. O servidor marca o tempo pela posição que já valida nos `move`.

export function createRace({ players, send, broadcast, teleport }) {
  const race = {
    state: 'idle', // idle | waiting | countdown | running
    entrants: new Set(),
    results: [],
    timer: null,
    startAt: 0,
    deadline: 0,
  };

  const snapshot = () => ({
    t: 'race',
    state: race.state,
    n: race.entrants.size,
    startsIn: race.state === 'waiting' ? Math.max(0, race.deadline - Date.now()) : 0,
    results: race.state === 'running' || race.state === 'idle' ? race.results : undefined,
  });

  const announce = () => broadcast(snapshot());

  function top() {
    return db.prepare('SELECT nick, side, time_ms FROM race_times ORDER BY time_ms ASC LIMIT 10').all();
  }

  function reset() {
    clearTimeout(race.timer);
    race.state = 'idle';
    race.entrants.clear();
    race.results = [];
  }

  function join(p) {
    if (race.state === 'running' || race.state === 'countdown') {
      return send(p.ws, { t: 'race', state: race.state, n: race.entrants.size, late: true });
    }
    race.entrants.add(p.id);
    if (race.state === 'idle') {
      race.state = 'waiting';
      race.deadline = Date.now() + RACE.waitMs;
      race.timer = setTimeout(countdown, RACE.waitMs);
    }
    announce();
  }

  function leave(p) {
    if (!race.entrants.has(p.id)) return;
    race.entrants.delete(p.id);
    if (race.state === 'running') {
      if (race.entrants.size === 0) finish();
    } else if (race.entrants.size === 0) {
      reset();
    }
    announce();
  }

  function countdown() {
    for (const id of race.entrants) if (!players.has(id)) race.entrants.delete(id);
    if (race.entrants.size === 0) { reset(); announce(); return; }
    race.state = 'countdown';
    // todos na linha de largada, lado a lado
    let i = 0;
    for (const id of race.entrants) {
      const p = players.get(id);
      const x = -6 + (i % 7) * 2 + Math.floor(i / 7) * 0.5;
      teleport(p, x, RACE.startZ - Math.floor(i / 7) * 1.5, 0);
      p.frozen = true;
      i += 1;
    }
    announce();
    race.timer = setTimeout(go, RACE.countdownMs);
  }

  function go() {
    race.state = 'running';
    race.startAt = Date.now();
    race.results = [];
    for (const id of race.entrants) { const p = players.get(id); if (p) p.frozen = false; }
    announce();
    race.timer = setTimeout(finish, RACE.maxMs);
  }

  /** Chamado a cada `move` aceito: marca a chegada de quem cruzou a linha. */
  function onMove(p) {
    if (race.state !== 'running' || !race.entrants.has(p.id)) return;
    if (p.z < RACE.finishZ) return;
    const time = Date.now() - race.startAt;
    race.entrants.delete(p.id);
    race.results.push({ id: p.id, nick: p.nick, side: p.side, time });
    db.prepare('INSERT INTO race_times (nick, side, time_ms, at) VALUES (?, ?, ?, ?)').run(p.nick, p.side, time, Date.now());
    send(p.ws, { t: 'race', state: 'finished', time, place: race.results.length });
    announce();
    if (race.entrants.size === 0) finish();
  }

  function finish() {
    clearTimeout(race.timer);
    const results = race.results;
    for (const id of race.entrants) { const p = players.get(id); if (p) p.frozen = false; }
    reset();
    broadcast({ t: 'race', state: 'results', results, top: top() });
  }

  function onLeave(p) {
    if (p.frozen) p.frozen = false;
    leave(p);
  }

  return {
    join, leave, onMove, onLeave, top, snapshot, get state() { return race.state; },
  };
}
