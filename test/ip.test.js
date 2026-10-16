import test from 'node:test';
import assert from 'node:assert/strict';
import { clientIp } from '../server/ip.js';

const req = (remoteAddress) => ({ headers: {}, socket: { remoteAddress } });

test('IPv4 que chega por socket dual-stack (::ffff:a.b.c.d) vira a.b.c.d, a chave que o admin digita', () => {
  assert.equal(clientIp(req('::ffff:203.0.113.7')), '203.0.113.7');
  assert.equal(clientIp(req('::ffff:127.0.0.1')), '127.0.0.1');
});

test('IPv4 puro e IPv6 de verdade passam como estão', () => {
  assert.equal(clientIp(req('203.0.113.7')), '203.0.113.7');
  assert.equal(clientIp(req('2001:db8::1')), '2001:db8::1');
  assert.equal(clientIp(req('::1')), '::1');
});
