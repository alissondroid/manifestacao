// Métricas sem cookie e sem dado pessoal: só contadores por origem (?src=), contados no servidor.
const q = new URLSearchParams(location.search);
export const origin = (q.get('src') || q.get('utm_source') || q.get('ref') || '').slice(0, 24);

export function track(event) {
  try {
    fetch('/api/track', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event, src: origin }), keepalive: true,
    }).catch(() => {});
  } catch { /* sem rede: tudo bem */ }
}

/** Uma visita por aba; "new" só na primeira vez neste navegador. */
export function trackVisit() {
  try {
    if (sessionStorage.getItem('avenida-online:visita')) return;
    sessionStorage.setItem('avenida-online:visita', '1');
    track('visit');
    if (!localStorage.getItem('avenida-online:veio')) { localStorage.setItem('avenida-online:veio', '1'); track('new'); }
  } catch { track('visit'); }
}

/** Quem convidou (?de=apelido): guardado neste navegador até a conta ser criada. */
const DE_KEY = 'avenida-online:de';
{
  const de = (q.get('de') || '').slice(0, 16);
  try { if (de && !localStorage.getItem(DE_KEY)) localStorage.setItem(DE_KEY, de); } catch { /* sem storage */ }
}
export function inviter() {
  try { return localStorage.getItem(DE_KEY) || undefined; } catch { return q.get('de')?.slice(0, 16) || undefined; }
}
