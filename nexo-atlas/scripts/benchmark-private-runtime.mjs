// Local-only measurement. Supply an already-authorized Tower file outside this
// checkout, and optionally the previous json-stream.mjs for alternating runs.
// No file contents, source records, credentials or snapshots are written.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {encodePrivateStream} from '../server/atlas/json-stream.mjs';

const input = process.argv[2], baseline = process.argv[3];
if (!input) throw new Error('Supply an authorized Tower file outside the Site checkout.');
const source = readFileSync(input);
const start = performance.now(), runtime = compilePrivateTowerRuntime(JSON.parse(source));
const compileMs = performance.now() - start;
const methods = [['current', encodePrivateStream]];
if (baseline) methods.unshift(['baseline', (await import(pathToFileURL(resolve(baseline)).href)).encodePrivateStream]);
const rows = []; let outputHash;
for (let round = 0; round < 3; round++) for (const [name, encode] of round % 2 ? [...methods].reverse() : methods) {
  global.gc?.();
  const start = performance.now(), encoded = await encode(runtime);
  const elapsedMs = performance.now() - start;
  const hash = createHash('sha256').update(gunzipSync(encoded.bytes)).digest('hex');
  outputHash ??= hash;
  if (hash !== outputHash) throw new Error('PRIVATE_RUNTIME_BYTES_CHANGED');
  rows.push({name, elapsedMs: Math.round(elapsedMs * 100) / 100, jsonBytes: encoded.jsonBytes, gzipBytes: encoded.bytes.length});
}
console.log(JSON.stringify({sourceBytes: source.length, compileMs: Math.round(compileMs * 100) / 100, sameOutput: true, rows}, null, 2));
