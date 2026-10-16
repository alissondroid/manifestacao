import { SPEED_SLACK } from '../shared/config.js';

// Regras puras do servidor de jogo (sem rede nem banco), para ficarem testáveis.

export const cleanText = (s, max) => String(s ?? '')
  .replace(/[\u0000-\u001f\u007f<>]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

// Apelidos que se passam pela equipe ou pelo sistema. A comparação ignora acento, maiúsculas, pontuação, números no lugar
// de letras (adm1n) e letras parecidas de outros alfabetos (о cirílico no lugar do o).
const RESERVED = new Set(['sistema', 'admin', 'administrador', 'moderador', 'moderacao', 'suporte', 'avenidaonline', 'dominio', 'staff', 'oficial', 'excluido']);
const LOOKALIKE = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ѕ: 's', ј: 'j', ԁ: 'd', ο: 'o', α: 'a', ν: 'v', ι: 'i', κ: 'k', ρ: 'p', τ: 't', υ: 'u', ɑ: 'a', ı: 'i',
};
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
const letters = (t) => t.replace(/[^a-z]/g, '');
const base = (nick) => String(nick).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\u0400-\u04ff\u0370-\u03ff\u0250-\u02af\u0131]/g, (c) => LOOKALIKE[c] ?? c);

export function isReservedNick(nick) {
  const b = base(nick);
  const skeletons = [letters(b), letters(b.replace(/[0-9@$!]/g, (c) => LEET[c] ?? c))];
  return skeletons.some((sk) => RESERVED.has(sk) || sk.startsWith('excluido'));
}

/** Apelido de convidado que não repete o de quem já está online (evita se passar por outro jogador). */
export function uniqueNick(nick, online, max) {
  const taken = new Set([...online].map((n) => String(n).toLowerCase()));
  if (!taken.has(nick.toLowerCase())) return nick;
  for (let n = 2; n < 1000; n += 1) {
    const tag = String(n);
    const candidate = `${nick.slice(0, Math.max(1, max - tag.length))}${tag}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${nick.slice(0, max - 4)}${Date.now() % 10000}`;
}

/**
 * Orçamento de deslocamento: acumula `limit * tempo real * SPEED_SLACK` (com teto, para absorver lag) e
 * gasta a distância andada. Impede velocidade acima do limite mesmo mandando muitas mensagens curtas.
 * Retorna true se o movimento cabe no orçamento (e já o desconta).
 */
export function spendMoveBudget(p, now, limit, dist) {
  const elapsed = Math.min(1, Math.max(0, (now - p.budgetAt) / 1000));
  p.budgetAt = now;
  const cap = limit * 0.6;
  p.budget = Math.min(cap, p.budget + limit * SPEED_SLACK * elapsed);
  if (dist > p.budget + 0.05) return false;
  p.budget -= dist;
  return true;
}

/**
 * Por que um golpe não acertou ninguém? Olha o jogador mais próximo dentro de 2× o alcance e devolve o motivo
 * (`code`) e a frase para o atacante, ou null se não havia ninguém perto (nada a explicar).
 * `spec`: { reach, arc } do golpe; `me`/`others`: { nick, x, z, ry, pvp, koUntil, shieldUntil }.
 */
export function diagnoseMiss(me, others, spec, now) {
  let near = null;
  let best = spec.reach * 2;
  for (const p of others) {
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (d < best) { best = d; near = p; }
  }
  if (!near) return null;
  if (!me.pvp) return { code: 'self_off', text: 'Ligue o PvP (🍅) para acertar outros jogadores.' };
  if (!near.pvp) return { code: 'target_off', text: `${near.nick} não ligou o PvP.` };
  if (near.koUntil > now || near.shieldUntil > now) return { code: 'protected', text: `${near.nick} está protegido por alguns segundos.` };
  if (best > spec.reach) return { code: 'too_far', text: 'Chegue mais perto para acertar.' };
  return { code: 'not_facing', text: `Fique de frente para ${near.nick}: ande na direção dele.` };
}
