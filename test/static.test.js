import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './helpers.js';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const built = fs.existsSync(path.join(DIST, 'index.html'));

function get(port, url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ port, host: '127.0.0.1', path: url, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

let srv;
test.before(async () => { if (built) srv = await startServer(); });
test.after(async () => { await srv?.stop(); });

const js = built ? fs.readdirSync(path.join(DIST, 'assets')).find((f) => f.endsWith('.js') && !f.endsWith('.br') && !f.endsWith('.gz')) : '';

test('o build gera versões .br e .gz dos arquivos que comprimem bem', { skip: !built }, () => {
  for (const f of [`assets/${js}`, 'index.html', 'models/ual1.glb']) {
    assert.ok(fs.existsSync(path.join(DIST, `${f}.br`)), `${f}.br`);
    assert.ok(fs.existsSync(path.join(DIST, `${f}.gz`)), `${f}.gz`);
  }
});

test('serve brotli quando o navegador aceita, igual ao original', { skip: !built }, async () => {
  const r = await get(srv.port, '/models/ual1.glb', { 'accept-encoding': 'gzip, br' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-encoding'], 'br');
  assert.equal(r.headers.vary, 'Accept-Encoding');
  assert.equal(r.headers['content-type'], 'model/gltf-binary');
  assert.equal(Number(r.headers['content-length']), r.body.length);
  assert.deepEqual(zlib.brotliDecompressSync(r.body), fs.readFileSync(path.join(DIST, 'models/ual1.glb')));
});

test('gzip como alternativa e sem compressão quando não aceita', { skip: !built }, async () => {
  const gz = await get(srv.port, `/assets/${js}`, { 'accept-encoding': 'gzip' });
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.deepEqual(zlib.gunzipSync(gz.body), fs.readFileSync(path.join(DIST, 'assets', js)));
  const plain = await get(srv.port, `/assets/${js}`);
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.equal(plain.headers.vary, 'Accept-Encoding');
  assert.ok(plain.body.length > gz.body.length);
});

test('ETag permite 304 e a página continua sem cache forte', { skip: !built }, async () => {
  const first = await get(srv.port, '/models/zsky.glb', { 'accept-encoding': 'br' });
  assert.ok(first.headers.etag);
  const again = await get(srv.port, '/models/zsky.glb', { 'accept-encoding': 'br', 'if-none-match': first.headers.etag });
  assert.equal(again.status, 304);
  assert.equal(again.body.length, 0);
  const other = await get(srv.port, '/models/zsky.glb', { 'accept-encoding': 'gzip' });
  assert.notEqual(other.headers.etag, first.headers.etag, 'cada codificação tem o seu ETag');
  const page = await get(srv.port, '/', { 'accept-encoding': 'br' });
  assert.equal(page.headers['cache-control'], 'no-cache');
  assert.equal(page.headers['content-encoding'], 'br');
});

test('imagens já comprimidas não ganham .br', { skip: !built }, () => {
  assert.ok(!fs.existsSync(path.join(DIST, 'og-image.png.br')));
});

test('q=0 recusa a codificação', { skip: !built }, async () => {
  const r = await get(srv.port, `/assets/${js}`, { 'accept-encoding': 'br;q=0, gzip;q=0.5' });
  assert.equal(r.headers['content-encoding'], 'gzip');
  const none = await get(srv.port, `/assets/${js}`, { 'accept-encoding': 'br;q=0, gzip;q=0' });
  assert.equal(none.headers['content-encoding'], undefined);
});
