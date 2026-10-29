import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {jsonTokens, jsonChunks, canonicalDigest, encodePrivateStream} from '../server/atlas/json-stream.mjs';
import {makePrivateRuntimeFixture} from './helpers/private-runtime.fixture.mjs';

test('bounded native serialization preserves the exact prior wire format', async () => {
  const sparse = new Array(3); sparse[1] = 'one';
  const values = [makePrivateRuntimeFixture(), {text: 'ação\u0000\n\\"🌌', sparse, omitted: undefined, infinity: Infinity},
    {toJSON() {return {notTheContract: true};}, original: 'preserved'},
    Array.from({length: 500}, (_, i) => ({id: i, text: 'scientific result '.repeat(5), nested: [null, true, {a: 1, b: 'x'}]})),
    {large: '🌌'.repeat(20_000), rows: [{text: '\\"'.repeat(10_000)}]},
  ];
  for (const value of values) {
    const original = [...jsonTokens(value)].join('');
    assert.equal([...jsonChunks(value)].join(''), original);
    const encoded = await encodePrivateStream(value);
    assert.equal(gunzipSync(encoded.bytes).toString(), original);
    assert.equal(encoded.jsonBytes, Buffer.byteLength(original));
    const canonical = [...jsonTokens(value, true)].join('');
    assert.equal(canonicalDigest(value), 'sha256:' + createHash('sha256').update(canonical).digest('hex'));
  }
});

test('large collections still serialize in bounded chunks, not a full secondary JSON string', () => {
  const rows = Array.from({length: 10_000}, (_, i) => ({id: i, value: 'x'.repeat(100), nested: {valid: true}}));
  let count = 0;
  for (const chunk of jsonChunks(rows)) {assert.ok(chunk.length <= 81920); count++;}
  assert.ok(count > 15);
  assert.equal([...jsonChunks(rows)].join(''), JSON.stringify(rows));
});
