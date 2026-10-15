import { spawn } from 'node:child_process';
import net from 'node:net';
import { WebSocket } from 'ws';

export const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

/** Sobe o servidor de verdade num processo filho, com banco em memória. */
export async function startServer(env = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(port), DB_PATH: ':memory:', NODE_ENV: 'test', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch { /* ainda subindo */ }
    await new Promise((r) => { setTimeout(r, 100); });
    if (i === 99) { child.kill(); throw new Error(`servidor não subiu:\n${out}`); }
  }
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    logs: () => out,
    stop: () => new Promise((resolve) => { child.once('exit', resolve); child.kill('SIGTERM'); }),
  };
}

/** Cliente WebSocket de teste que guarda as mensagens recebidas. */
export async function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const msgs = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    msgs.push(m);
    for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return {
    ws,
    msgs,
    send: (o) => ws.send(JSON.stringify(o)),
    waitFor: (test, ms = 3000) => new Promise((resolve, reject) => {
      const found = msgs.find(test);
      if (found) return resolve(found);
      const w = { test, resolve };
      waiters.push(w);
      setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error('timeout esperando mensagem')); }, ms);
      return undefined;
    }),
    close: () => ws.close(),
  };
}

export const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
