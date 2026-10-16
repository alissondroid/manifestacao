import test from 'node:test';
import assert from 'node:assert/strict';

// WebSocket falso: cada connect() cria uma instância; o teste dispara onclose com o código que quiser.
const sockets = [];
class FakeWS {
  static OPEN = 1;
  constructor(url) { this.url = url; this.readyState = 0; sockets.push(this); }
  close() { this.readyState = 3; }
  send() {}
}
globalThis.WebSocket = FakeWS;
globalThis.location = { protocol: 'http:', host: 'localhost:1' };
const { Net } = await import('../src/net.js');

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const fresh = () => { sockets.length = 0; const closes = []; const net = new Net({ close: (code, reason) => closes.push([code, reason]) }); net.connect(); return { net, closes }; };

test('queda de rede (1006): reconecta sozinho', async () => {
  fresh();
  sockets[0].onclose({ code: 1006 });
  await sleep(700);
  assert.equal(sockets.length, 2, 'deveria ter tentado reconectar');
});

for (const [code, motivo] of [[4000, /outro lugar/i], [4001, /exclu/i], [4003, /bloquead/i]]) {
  test(`fechamento intencional do servidor (${code}): não reconecta e informa o motivo`, async () => {
    const { closes } = fresh();
    sockets[0].onclose({ code });
    await sleep(1200);
    assert.equal(sockets.length, 1, `não deveria reconectar depois do código ${code}`);
    assert.equal(closes[0][0], code);
    assert.match(closes[0][1], motivo);
  });
}

test('reconnect() depois de um fechamento intencional volta a conectar (ex.: depois de entrar na conta)', async () => {
  const { net } = fresh();
  sockets[0].onclose({ code: 4000 });
  net.reconnect();
  assert.equal(sockets.length, 2);
});

test('o intervalo de reconexão tem jitter e respeita o teto', () => {
  const { backoff } = globalThis.__netTest ?? {};
  // sem exportar nada novo: duas esperas do mesmo nível não podem ser sempre iguais
  const waits = new Set();
  for (let i = 0; i < 20; i += 1) {
    const { net } = fresh();
    net.retry = 3;
    const t0 = Date.now();
    const orig = globalThis.setTimeout;
    let captured = 0;
    globalThis.setTimeout = (fn, ms) => { captured = ms; return 0; };
    sockets[0].onclose({ code: 1006 });
    globalThis.setTimeout = orig;
    waits.add(Math.round(captured));
    assert.ok(captured <= 8000 && captured >= 2000, `espera fora da faixa: ${captured}`); // 500·2³ = 4000 → 2000..4000
    void t0; void backoff;
  }
  assert.ok(waits.size > 1, 'as esperas deveriam variar (jitter)');
});

test('leave() (página fechando ou indo para o cache): fecha o socket sem reconectar sozinho', async () => {
  const { net } = fresh();
  net.leave();
  assert.equal(sockets[0].readyState, 3);
  sockets[0].onclose({ code: 1000 });
  await sleep(1200);
  assert.equal(sockets.length, 1, 'não deve reconectar sozinho depois de sair da página');
});

test('reconnect() depois de leave() (página voltou do cache) conecta de novo e reenvia o join', async () => {
  const { net } = fresh();
  net.join({ nick: 'Ana', side: 0, look: {} });
  net.leave();
  sockets[0].onclose({ code: 1000 });
  net.reconnect();
  assert.equal(sockets.length, 2);
  const sent = [];
  sockets[1].readyState = 1;
  sockets[1].send = (d) => sent.push(JSON.parse(d));
  sockets[1].onopen();
  assert.ok(sent.some((m) => m.t === 'join' && m.nick === 'Ana'));
});
