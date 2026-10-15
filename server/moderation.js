// Filtro de palavras do chat, cartazes e bandeiras. Lista em BLOCKED_WORDS (separada por vírgula).
const BLOCKED = (process.env.BLOCKED_WORDS || '').split(',').map((w) => w.trim()).filter(Boolean);

export const filterText = (text) => BLOCKED.reduce(
  (acc, w) => acc.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '***'),
  text,
);
