// IP do cliente. Só confia em X-Forwarded-For atrás de um proxy seu (TRUST_PROXY=1) e usa o último
// valor, o que o proxy acrescentou; o primeiro vem do cliente e pode ser falsificado.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

export function clientIp(req) {
  if (TRUST_PROXY) {
    const last = String(req.headers['x-forwarded-for'] ?? '').split(',').pop().trim();
    if (last) return last;
  }
  return req.socket.remoteAddress;
}
