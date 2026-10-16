// IP do cliente. Só confia em X-Forwarded-For atrás de um proxy seu (TRUST_PROXY=1) e usa o último
// valor, o que o proxy acrescentou; o primeiro vem do cliente e pode ser falsificado.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

// Socket dual-stack entrega IPv4 como "::ffff:a.b.c.d"; sem normalizar, o ban por "ip:a.b.c.d" nunca casaria.
const plain = (ip) => (typeof ip === 'string' ? ip.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1') : ip);

export function clientIp(req) {
  if (TRUST_PROXY) {
    const last = String(req.headers['x-forwarded-for'] ?? '').split(',').pop().trim();
    if (last) return plain(last);
  }
  return plain(req.socket.remoteAddress);
}
