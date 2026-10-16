// Regras puras dos fogos (formas do estouro, brilho, cor e áudio por distância): sem Three.js nem Web Audio, para testar.

/** gravity em m/s², drag por segundo, life em segundos, count de partículas, size do ponto. */
export const BURST_STYLE = {
  peony: {
    gravity: 5, drag: 0.9, life: 2.4, count: 130, size: 0.5, trails: 3,
  },
  ring: {
    gravity: 4, drag: 1.0, life: 2.2, count: 90, size: 0.5, trails: 3,
  },
  willow: {
    gravity: 3.2, drag: 1.7, life: 3.6, count: 110, size: 0.42, trails: 4, gold: true,
  },
  palm: {
    gravity: 6, drag: 1.1, life: 2.7, count: 144, size: 0.48, trails: 3,
  },
};

const TYPES = Object.keys(BURST_STYLE);

/**
 * Direções (x, y, z) e fator de velocidade (speed) de cada partícula de um estouro.
 * `tilt` (rad) inclina o anel; sem ele, sorteia.
 */
export function burstShape(type, n, rand = Math.random, tilt = (rand() - 0.5) * 1.2) {
  const out = [];
  if (type === 'ring') {
    const st = Math.sin(tilt);
    const ct = Math.cos(tilt);
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a);
      const z = Math.sin(a);
      out.push({ x, y: z * st, z: z * ct, speed: 0.95 + rand() * 0.1 });
    }
    return out;
  }
  if (type === 'palm') {
    const arms = 6 + Math.floor(rand() * 3);
    const per = Math.ceil(n / arms);
    const phase = rand() * Math.PI * 2;
    for (let i = 0; i < n; i += 1) {
      const arm = i % arms;
      const a = phase + (arm / arms) * Math.PI * 2;
      const up = 0.5; // braços sobem em leque e depois caem
      const along = ((i / arms) | 0) / per; // 0..1 ao longo do braço
      const h = Math.hypot(1, up);
      out.push({ x: Math.cos(a) / h, y: up / h, z: Math.sin(a) / h, speed: 0.35 + 0.65 * along + rand() * 0.02 });
    }
    return out;
  }
  // peônia e salgueiro: esfera uniforme
  for (let i = 0; i < n; i += 1) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const speed = type === 'willow' ? 0.5 + rand() * 0.5 : 0.85 + rand() * 0.15;
    out.push({ x: r * Math.cos(a), y: u, z: r * Math.sin(a), speed });
  }
  return out;
}

/** Sorteia os tipos dos estouros de uma salva, sempre com pelo menos dois diferentes. */
export function pickShow(count, rand = Math.random) {
  const show = [];
  for (let i = 0; i < count; i += 1) show.push(TYPES[Math.floor(rand() * TYPES.length)]);
  if (count > 1 && new Set(show).size < 2) show[count - 1] = TYPES[(TYPES.indexOf(show[0]) + 1 + Math.floor(rand() * (TYPES.length - 1))) % TYPES.length];
  return show;
}

/**
 * Brilho 0..1 da partícula em k = idade/vida: acende rápido, depois só cai e apaga.
 * `phase` e `twinkle` (0..1) fazem a faísca cintilar sem passar de 1.
 */
export function particleBrightness(k, phase = 0, twinkle = 0) {
  if (k >= 1) return 0;
  const kk = Math.max(0, k);
  const rise = Math.min(1, 0.3 + kk / 0.06 * 0.7);
  const fall = (1 - kk) ** 1.6;
  const flicker = 1 - twinkle * (0.5 + 0.5 * Math.sin(phase * 12.9898 + kk * 38));
  return Math.max(0, Math.min(1, rise * fall * flicker));
}

const EMBER = [1, 0.42, 0.08];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Cor [r,g,b] 0..1: branca quente ao nascer, a cor do estouro no meio, brasa laranja ao esfriar. */
export function particleTint(k, base) {
  const kk = Math.max(0, Math.min(1, k));
  if (kk < 0.14) return mix([1, 1, 0.92], base, kk / 0.14);
  if (kk < 0.5) return base.slice();
  return mix(base, EMBER, Math.min(1, (kk - 0.5) / 0.45));
}

/** Som por distância: volume, atraso (velocidade do som comprimida) e abafamento (corte do filtro, em Hz). */
export function fireworkAudio(distance) {
  const d = Math.max(0, distance);
  return {
    gain: Math.max(0.04, Math.min(1, 1 / (1 + d / 18))),
    delay: Math.min(1.5, d / 140),
    cutoff: Math.max(700, Math.min(9000, 9000 / (1 + d / 30))),
  };
}

/** Pan estéreo -0.9..0.9 a partir da posição do estouro no espaço da câmera (x à direita, z para trás). */
export function panFromOffset(localX, localZ) {
  const dist = Math.hypot(localX, localZ);
  if (dist < 1e-6) return 0;
  const pan = (localX / dist) * Math.min(1, dist / 12);
  return Math.max(-0.9, Math.min(0.9, pan));
}
