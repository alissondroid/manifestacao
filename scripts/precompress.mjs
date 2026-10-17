// Depois do build: gera .br e .gz ao lado dos arquivos que comprimem bem. O servidor entrega a
// versão pré-comprimida (brotli no nível máximo, que o proxy não faria por requisição).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const EXT = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest', '.xml', '.txt', '.glb', '.ico']);
const MIN = 1024;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let before = 0;
let after = 0;
for (const file of walk(DIST)) {
  if (file.endsWith('.br') || file.endsWith('.gz') || !EXT.has(path.extname(file))) continue;
  const data = fs.readFileSync(file);
  if (data.length < MIN) continue;
  const br = zlib.brotliCompressSync(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length } });
  const gz = zlib.gzipSync(data, { level: 9 });
  for (const [ext, out] of [['.br', br], ['.gz', gz]]) {
    if (out.length < data.length * 0.95) fs.writeFileSync(file + ext, out);
    else fs.rmSync(file + ext, { force: true });
  }
  before += data.length;
  after += Math.min(br.length, data.length);
}
console.log(`precompress: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB em brotli`);
