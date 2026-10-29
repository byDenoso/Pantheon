import {createHash} from 'node:crypto';

// Serialize the same JSON contract in bounded pieces. Canonical mode preserves
// the existing sorted-object fingerprint without cloning an entire generation.
export function* jsonTokens(value, canonical = false) {
  if (value === null || typeof value !== 'object') {yield JSON.stringify(value) ?? 'null'; return;}
  if (Array.isArray(value)) {
    yield '[';
    for (let i = 0; i < value.length; i++) {if (i) yield ','; yield* jsonTokens(value[i], canonical);}
    yield ']'; return;
  }
  let keys = Object.keys(value);
  if (canonical) keys = Object.keys(Object.fromEntries(keys.sort().map(k => [k, null])));
  yield '{'; let first = true;
  for (const key of keys) {
    if (value[key] === undefined || typeof value[key] === 'function' || typeof value[key] === 'symbol') continue;
    if (!first) yield ','; first = false; yield JSON.stringify(key); yield ':'; yield* jsonTokens(value[key], canonical);
  }
  yield '}';
}
// The wire serializer can let V8 encode small subtrees in one operation instead
// of yielding separately for every key, colon and scalar in a 40 MB runtime.
// Inspect with a strict budget first: never materialize a whole view or runtime
// as a second large JSON string. Canonical fingerprint serialization is unchanged.
function fitsNativeChunk(value, budget) {
  if (--budget.nodes < 0) return false;
  if (typeof value === 'string') {budget.chars -= value.length * 6 + 2; return budget.chars >= 0;}
  if (value === null || typeof value !== 'object') {budget.chars -= 32; return budget.chars >= 0;}
  if (typeof value.toJSON === 'function') return false;
  if (Array.isArray(value)) {
    if (value.length > budget.nodes) return false;
    budget.chars -= value.length + 2;
    return value.every(item => fitsNativeChunk(item, budget));
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const keys = Object.keys(value);
  if (keys.length > budget.nodes) return false;
  budget.chars -= 2;
  return keys.every(key => {
    budget.chars -= key.length * 6 + 4;
    return budget.chars >= 0 && fitsNativeChunk(value[key], budget);
  });
}
function* wireTokens(value) {
  if (value === null || typeof value !== 'object' || fitsNativeChunk(value, {nodes: 256, chars: 16384})) {
    yield JSON.stringify(value) ?? 'null'; return;
  }
  if (Array.isArray(value)) {
    yield '[';
    for (let i = 0; i < value.length; i++) {if (i) yield ','; yield* wireTokens(value[i]);}
    yield ']'; return;
  }
  yield '{'; let first = true;
  for (const key of Object.keys(value)) {
    if (value[key] === undefined || typeof value[key] === 'function' || typeof value[key] === 'symbol') continue;
    if (!first) yield ','; first = false; yield JSON.stringify(key); yield ':'; yield* wireTokens(value[key]);
  }
  yield '}';
}
export function* jsonChunks(value, canonical = false) {
  let chunk = '';
  // Fewer stream/compressor handoffs without increasing memory with data size.
  const target = canonical ? 16384 : 65536;
  for (const token of canonical ? jsonTokens(value, true) : wireTokens(value)) {
    chunk += token;
    if (chunk.length >= target) {yield chunk; chunk = '';}
  }
  if (chunk) yield chunk;
}
export function canonicalDigest(value) {
  const hash = createHash('sha256');
  for (const chunk of jsonChunks(value, true)) hash.update(chunk);
  return 'sha256:' + hash.digest('hex');
}
export async function encodePrivateStream(value) {
  const iterator = jsonChunks(value), encoder = new TextEncoder(); let size = 0;
  const stream = new ReadableStream({
    pull(controller) {
      try {
        const {value: chunk, done} = iterator.next();
        if (done) {controller.close(); return;}
        const bytes = encoder.encode(chunk); size += bytes.length;
        if (size > 64 * 1024 * 1024) throw new Error('PRIVATE_RESPONSE_TOO_LARGE');
        controller.enqueue(bytes);
      } catch (error) {controller.error(error);}
    },
    cancel() {iterator.return();},
  });
  // Only bounded compressed bytes are buffered, never a second full 40 MB JSON
  // string or Buffer. No records, fields, or views are omitted.
  const compressed = stream.pipeThrough(new CompressionStream('gzip'));
  const reader = compressed.getReader(), chunks = []; let wireBytes = 0;
  for (;;) {
    const {value: chunk, done} = await reader.read(); if (done) break;
    wireBytes += chunk.byteLength;
    if (wireBytes > 8 * 1024 * 1024) {await reader.cancel(); throw new Error('PRIVATE_RESPONSE_TOO_LARGE');}
    chunks.push(chunk);
  }
  return {bytes: Buffer.concat(chunks), encoding: 'gzip', jsonBytes: size};
}
