import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {parseSourceEnvelope} from '../worker/retrieval/source-envelope.mjs';
import {parsePythonJSON, canonical, pyStr, entries, record, PythonFloat} from '../worker/retrieval/python-json.mjs';

test('source envelope returns ordered raw ranges and independently parsed exact entries', () => {
  const raw = '{"id":"tower","files":{"10":{"value":[9007199254740993,1.0,-0.0]},"2":{"value":"é😀"},"__proto__":{"encoding":"json"}},"file_count":3}';
  const envelope = parseSourceEnvelope(raw);
  assert.deepEqual(entries(envelope.metadata), [['id', 'tower'], ['file_count', 3]]);
  assert.deepEqual([...envelope.fileRanges.keys()], ['10', '2', '__proto__']);
  const entry = envelope.entry('10');
  assert.equal(entry.value[0], 9007199254740993n);
  assert(entry.value[1] instanceof PythonFloat);
  assert.equal(Object.is(entry.value[2].value, -0), true);
  assert.notEqual(envelope.entry('10'), entry, 'Parsed files must not be retained in a cache');
  assert.equal(envelope.entry('absent'), undefined);
  for (const [path, [start, end]] of envelope.fileRanges) {
    assert.equal(canonical(parsePythonJSON(raw.slice(start, end))), canonical(envelope.entry(path)));
  }
  envelope.fileRanges.set('10', [0, raw.length]);
  assert.equal(canonical(envelope.entry('10')), '{"value":[9007199254740993,1.0,-0.0]}');
});

test('duplicate outer and file keys use Python last-value / first-position semantics', () => {
  const raw = '{"meta":1,"files":[],"x":2,"meta":3,"files":{"10":0,"2":1,"10":2,"1":3,"2":4}}';
  const value = parseSourceEnvelope(raw);
  assert.deepEqual(entries(value.metadata), [['meta', 3], ['x', 2]]);
  assert.deepEqual([...value.entries()].map(([key, entry]) => [key, entry]), [['10', 2], ['2', 4], ['1', 3]]);
  assert.deepEqual([...value.entries({sorted: true})].map(([key]) => key), ['1', '10', '2']);
  assert.throws(() => parseSourceEnvelope('{"files":{},"files":[]}'), /FILES_OBJECT_REQUIRED/);
  assert.equal(parseSourceEnvelope('{"files":{"x":1},"files":{}}').fileRanges.size, 0);
});

test('complete envelope canonical reconstruction matches Python JSON stdlib', () => {
  const sources = [
    '{"files":{}}',
    '{"files":{"\\ud800\\udc00":{"x":1},"\\ue000":{"x":2},"10":{"x":3},"2":{"x":4}},"name":"é😀"}',
    '{"files":{"test":{"value":{"1":true,"10":1.0,"2":-0.0,"big":9007199254740993,"s":"\\u0000\\b\\f\\n\\r\\t/\\\\\\\""}}},"version":2}',
    '{"files":{"x":null,"x":{"nested":[null,true,false,-1.25e-7,1e23,1e-9999,-1e-9999,{},[]]}}}',
    '{"before":[1,2.0],"files":{"__proto__":{"constructor":3,"toString":"test"}},"after":{}}',
  ];
  const result = spawnSync(process.env.PYTHON || 'python3', ['-c', `import json,sys
print(json.dumps([json.dumps(json.loads(s),sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False) for s in json.load(sys.stdin)]))`], {input: JSON.stringify(sources), encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const expected = JSON.parse(result.stdout);
  for (const [index, raw] of sources.entries()) {
    const envelope = parseSourceEnvelope(raw);
    const reconstructed = record([...entries(envelope.metadata), ['files', record(envelope.entries())]]);
    assert.equal(canonical(reconstructed), expected[index]);
    assert.equal(pyStr(reconstructed.files), pyStr(parsePythonJSON(raw).files));
  }
});

test('scanner validates every skipped file, including malformed syntax and unsupported numbers', () => {
  for (const value of ['', '+1', '01', '-01', '1.', '.1', '1e', '1e+', '[1,]', '{"a":1,}',
    'true false', 'NaN', 'Infinity', '-Infinity', '{"x" 1}', '"\n"', '"\\q"', '"\\u000"', '"\\uxxxx"']) {
    assert.throws(() => parseSourceEnvelope('{"files":{"skipped":' + value + '}}'), SyntaxError, value);
  }
  for (const raw of ['', '[]', 'null', '{}', '{"files":null}', '{"files":[]}', '{"files":{},}', '{"files":{}} trailing']) {
    assert.throws(() => parseSourceEnvelope(raw), undefined, raw);
  }
  assert.throws(() => parseSourceEnvelope('{"files":{"x":1e999}}'), /NON_FINITE/);
  assert.throws(() => parseSourceEnvelope('{"files":{"x":' + '9'.repeat(4301) + '}}'), /INTEGER_DIGIT_BOUND/);
  assert.throws(() => parseSourceEnvelope('{"files":{"x":' + '['.repeat(514) + '0' + ']'.repeat(514) + '}}'), /DEPTH_BOUND/);
  // A bad earlier duplicate is still parsed/validated, just as the strict parser.
  assert.throws(() => parseSourceEnvelope('{"files":{"x":01},"files":{}}'), SyntaxError);
});

test('scanner rejects Unicode that Python canonical UTF-8 encoding cannot represent', () => {
  for (const quoted of ['"\\ud800"', '"\\udfff"', '"\\ud800a"', '"\\ud800\\u0000"', '"\ud800"', '"\udfff"', '"\ud800\\udfff"']) {
    assert.throws(() => parseSourceEnvelope('{"files":{"x":' + quoted + '}}'), /LONE_SURROGATE/, quoted);
  }
  assert.equal(parseSourceEnvelope('{"files":{"\\ud800\\udc00":"😀"}}').entry('𐀀'), '😀');
  assert.throws(() => parseSourceEnvelope('{"files":{"\\ud800":null}}'), /LONE_SURROGATE/);
});

test('many-file envelope retains only ranges and parses values lazily', () => {
  const files = Array.from({length: 12000}, (_, index) => `"${index}":{"value":{"n":${index},"f":1.0,"text":"${'x'.repeat(250)}"}}`);
  const envelope = parseSourceEnvelope('{"files":{' + files.join(',') + '},"file_count":12000}');
  assert.equal(envelope.fileRanges.size, 12000);
  assert.equal(envelope.metadata.file_count, 12000);
  assert.equal(Object.hasOwn(envelope.metadata, 'files'), false);
  assert.equal(envelope.entry('11999').value.n, 11999);
  let count = 0;
  for (const [key, value] of envelope.entries()) { assert.equal(value.value.n, Number(key)); count++; }
  assert.equal(count, 12000);
});
