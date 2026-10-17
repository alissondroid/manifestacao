// Shows de fogos em horários fixos (horário de Brasília): aviso 5 e 1 minuto antes e o espetáculo na hora.
export const SHOWS = {
  times: (process.env.SHOW_TIMES ?? '12:00,20:00').split(',').map((t) => t.trim()).filter((t) => /^\d{2}:\d{2}$/.test(t)),
  warnMinutes: [5, 1],
  bursts: 24, // quantos fogos no espetáculo
  everyMs: 1400,
  radius: 28, // metros em volta do centro da avenida
};

const minuteOfDay = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** O que acontece neste minuto: { warn: minutos } | { start: true } | null. */
export function showAt(nowMs, cfg = SHOWS) {
  const d = new Date(nowMs - 3 * 3600_000);
  const now = d.getUTCHours() * 60 + d.getUTCMinutes();
  for (const t of cfg.times) {
    const at = minuteOfDay(t);
    if (now === at) return { start: true };
    for (const w of cfg.warnMinutes) if (now === (at - w + 1440) % 1440) return { warn: w };
  }
  return null;
}
