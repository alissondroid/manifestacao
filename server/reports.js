import { db } from './db.js';

// Denúncias de jogadores. Guardam o apelido, quem denunciou e as últimas mensagens do denunciado
// (consulta: sqlite3 data/avenida.db "SELECT datetime(at/1000,'unixepoch'), target_nick, reporter_nick, context FROM reports ORDER BY id DESC LIMIT 20").
// Com denúncias de várias pessoas diferentes em pouco tempo, o denunciado é silenciado automaticamente por um tempo.

export const REPORT = {
  cooldownMs: 10_000, // entre duas denúncias do mesmo jogador
  perHour: 10,
  sameTargetMs: 10 * 60_000, // não denunciar o mesmo jogador de novo nesse prazo
  windowMs: 10 * 60_000, // janela para somar denúncias de pessoas diferentes
  autoMuteAt: 3, // pessoas diferentes
  muteMs: 5 * 60_000,
  keep: 200, // mensagens de chat guardadas
  context: 5, // mensagens do denunciado anexadas à denúncia
};

const history = []; // { key, nick, text, at }
const lastBy = new Map(); // reporterKey -> instante da última denúncia

export function recordChat(key, nick, text, at = Date.now()) {
  history.push({ key, nick, text, at });
  if (history.length > REPORT.keep) history.shift();
}

/**
 * Registra uma denúncia. `reporter`/`target`: { key, nick } (key = id da conta ou IP, para contar pessoas diferentes).
 * Retorna { ok: true, mute } ou { ok: false, reason }.
 */
export function fileReport(reporter, target, now = Date.now()) {
  if (now - (lastBy.get(reporter.key) || 0) < REPORT.cooldownMs) return { ok: false, reason: 'Espere um pouco para denunciar de novo.' };
  const hour = db.prepare('SELECT COUNT(*) n FROM reports WHERE reporter_key = ? AND at > ?').get(reporter.key, now - 3_600_000).n;
  if (hour >= REPORT.perHour) return { ok: false, reason: 'Você já enviou muitas denúncias. Tente mais tarde.' };
  const dup = db.prepare('SELECT 1 FROM reports WHERE reporter_key = ? AND target_nick = ? AND at > ?')
    .get(reporter.key, target.nick.toLowerCase(), now - REPORT.sameTargetMs);
  if (dup) return { ok: false, reason: 'Você já denunciou esse jogador.' };

  lastBy.set(reporter.key, now);
  const context = history.filter((h) => h.key === target.key).slice(-REPORT.context).map((h) => h.text);
  db.prepare('INSERT INTO reports (at, reporter_nick, reporter_key, target_nick, target_key, context) VALUES (?, ?, ?, ?, ?, ?)')
    .run(now, reporter.nick, reporter.key, target.nick.toLowerCase(), target.key, JSON.stringify(context));
  const distinct = db.prepare('SELECT COUNT(DISTINCT reporter_key) n FROM reports WHERE target_nick = ? AND at > ?')
    .get(target.nick.toLowerCase(), now - REPORT.windowMs).n;
  return { ok: true, mute: distinct >= REPORT.autoMuteAt };
}
