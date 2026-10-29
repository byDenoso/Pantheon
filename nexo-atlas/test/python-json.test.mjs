import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {
  PythonFloat, pythonFloat, parsePythonJSON, canonical, canonicalBytes, pyStr,
  pyTruthy, isNumeric, isRecord, entries, record, equal, typedEqual, numberKey,
  floatString, clonePythonJson,
} from '../worker/retrieval/python-json.mjs';

function oracle(program, input) {
  const result = spawnSync(process.env.PYTHON || 'python3', ['-c', program], {
    input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, 'The focused parity suite requires the local Python stdlib oracle');
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('raw numeric parsing preserves Python int/float identity and every integer bit', () => {
  const values = parsePythonJSON('[0,-0,1,1.0,-0.0,1e0,9007199254740991,9007199254740992,9007199254740993,-9007199254740993,1e23]');
  assert.equal(values[0], 0);
  assert.equal(Object.is(values[1], -0), false);
  assert.equal(values[2], 1);
  assert(values[3] instanceof PythonFloat);
  assert.equal(Object.is(values[4].value, -0), true);
  assert(values[5] instanceof PythonFloat);
  assert.equal(values[6], Number.MAX_SAFE_INTEGER);
  assert.equal(values[7], 9007199254740992n);
  assert.equal(values[8], 9007199254740993n);
  assert.equal(values[9], -9007199254740993n);
  assert.equal(canonical(values), '[0,0,1,1.0,-0.0,1.0,9007199254740991,9007199254740992,9007199254740993,-9007199254740993,1e+23]');
  assert.equal(canonical(pythonFloat(1)), '1.0');
  assert.equal(canonical({count: 1, average: pythonFloat(1)}), '{"average":1.0,"count":1}');
  assert.throws(() => JSON.stringify(values[3]), /USE_CANONICAL/);
  assert.throws(() => +values[3], /EXPLICIT_FLOAT_VALUE/);
  assert.equal(String(values[3]), '1.0');
  assert.throws(() => canonical(9007199254740992), /AMBIGUOUS_UNSAFE_NUMBER/);
});

test('dictionary order, duplicate keys, and special property names match Python', () => {
  const value = parsePythonJSON('{"10":1,"2":2,"__proto__":{"polluted":true},"constructor":3,"10":4,"1":5}');
  assert.equal(Object.getPrototypeOf(value), null);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(entries(value).map(([key]) => key), ['10', '2', '__proto__', 'constructor', '1']);
  assert.deepEqual(Object.keys(value), ['10', '2', '__proto__', 'constructor', '1']);
  assert.equal(value['10'], 4);
  assert.equal(value.__proto__.polluted, true);
  assert.equal(pyStr(value), "{'10': 4, '2': 2, '__proto__': {'polluted': True}, 'constructor': 3, '1': 5}");
  value['0'] = 'last'; delete value['2']; value['2'] = 'again';
  assert.deepEqual(Object.keys(value), ['10', '__proto__', 'constructor', '1', '0', '2']);
  const copy = clonePythonJson(value);
  assert.notEqual(copy, value);
  assert.notEqual(copy.__proto__, value.__proto__);
  assert.deepEqual(entries(copy).map(([key]) => key), Object.keys(value));
  assert.equal(pyStr(copy), pyStr(value));
  assert.equal(isRecord(value), true);
  assert.equal(isRecord(pythonFloat(1)), false);
  assert.equal(isRecord([]), false);
  assert.throws(() => record([[1, 'bad']]), /STRING_KEYS/);
  assert.throws(() => Object.defineProperty(value, 'accessor', {get() { return 1; }}), /ACCESSORS/);
  Object.freeze(copy);
  assert.equal(Object.isFrozen(copy), true);
});

test('canonical byte strings, Python repr, truthiness, and ordering match stdlib', () => {
  const sources = [
    'null', 'true', 'false', '0', '-0', '-0.0', '1.0', '1e0', '1e-9999', '-1e-9999',
    '9007199254740993', '-9999999999999999999999999999999999999999999999999',
    '1e23', '1e16', '1e15', '1e-4', '1e-5', '1.0000000000000002', '5e-324',
    '2.2250738585072014e-308', '1.7976931348623157e308',
    '[]', '{}', '""', '"é漢字😀"',
    '{"10":1,"2":2,"__proto__":3,"constructor":4,"toString":5,"10":6}',
    '{"\\ud800\\udc00":1,"\\ue000":2,"é":3,"a":4,"\\u0000":5}',
    '["é","\\u0000\\b\\f\\n\\r\\t/\\\\\\\"","\\u2028\\u2029","a\u00a0b","\\u200d", "\\ud83d\\ude00"]',
    '["has\'quote", "both\'\\\"quotes", "double\\\"quote", "\\u0007\\u000b\\u001b\\u007f\\u0085"]',
    '{"a":[null,true,false,1,1.0,-0.0,9007199254740993],"b":{"z":1,"x":2}}',
  ];
  const expected = oracle(`import json,sys
result=[]
for source in json.load(sys.stdin):
 value=json.loads(source)
 result.append([json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False),str(value),bool(value)])
print(json.dumps(result,ensure_ascii=True))`, sources);
  for (const [index, source] of sources.entries()) {
    const value = parsePythonJSON(source), [bytes, text, truthy] = expected[index];
    assert.equal(canonical(value), bytes, source);
    assert.deepEqual(canonicalBytes(value), new TextEncoder().encode(bytes), source);
    assert.equal(pyStr(value), text, source);
    assert.equal(pyTruthy(value), truthy, source);
  }
});

test('float formatter matches Python for binary exponent boundaries and seeded random binary64', () => {
  const fixtures = oracle(`import json,math,random,struct
result=[]
def add(bits):
 if not 0 <= bits < 2**64:return
 value=struct.unpack('>d',bits.to_bytes(8,'big'))[0]
 if math.isfinite(value):result.append([str(bits),repr(value)])
for exponent in range(-1074,1024):
 value=math.ldexp(1.,exponent)
 bits=int.from_bytes(struct.pack('>d',value),'big')
 for offset in range(-2,3):add(bits+offset)
randomizer=random.Random(732049)
for _ in range(12000):add(randomizer.getrandbits(64))
for bits in [0,2**63,0x7fefffffffffffff,0xffefffffffffffff]:add(bits)
print(json.dumps(result))`, null);
  const view = new DataView(new ArrayBuffer(8));
  for (const [bits, expected] of fixtures) {
    view.setBigUint64(0, BigInt(bits), false);
    const value = view.getFloat64(0, false);
    assert.equal(floatString(value), expected, `binary64 bits ${bits}`);
    assert.equal(canonical(pythonFloat(value)), expected, `canonical bits ${bits}`);
    assert.equal(canonical(parsePythonJSON(expected)), expected, `parse roundtrip bits ${bits}`);
  }
  assert(fixtures.length > 22000);
});

test('Python string repr uses pinned Unicode printability rather than JS Unicode version', () => {
  const fixture = oracle(`import json,sys,unicodedata
assert unicodedata.unidata_version=='15.0.0', 'Unicode oracle must match reviewed producer'
# Include every printability boundary and supplementary, unassigned and surrogate code points.
points={0,0x10ffff}
previous=False
for cp in range(0x110000):
 printable=chr(cp).isprintable()
 if printable!=previous:points.update((cp-1,cp))
 previous=printable
value=''.join(chr(cp) for cp in sorted(points) if cp>=0)
print(json.dumps([value,str([value])],ensure_ascii=True))`, null);
  assert.equal(pyStr([fixture[0]]), fixture[1]);
});

test('numeric keys and recursive equality reproduce Python comparison semantics', () => {
  const pairs = [
    ['true', '1'], ['false', '-0.0'], ['1', '1.0'], ['1', '"1"'],
    ['9007199254740993', '9007199254740992.0'],
    ['100000000000000000000000', '1e23'],
    ['99999999999999991611392', '1e23'],
    ['[true,1,1.0]', '[1,1.0,true]'], ['{}', '[]'],
    ['{"10":true,"2":1}', '{"2":1.0,"10":1}'],
    ['[9007199254740993]', '[9007199254740992.0]'],
  ];
  const expected = oracle(`import json,sys
from decimal import Decimal
def typed(a,b):
 if isinstance(a,bool) or isinstance(b,bool):return type(a) is type(b) and a==b
 if isinstance(a,(int,float)) and isinstance(b,(int,float)):return Decimal(str(a))==Decimal(str(b))
 return type(a) is type(b) and a==b
result=[]
for sa,sb in json.load(sys.stdin):
 a,b=json.loads(sa),json.loads(sb)
 result.append([a==b,typed(a,b)])
print(json.dumps(result))`, pairs);
  for (const [index, [a, b]] of pairs.entries()) {
    const left = parsePythonJSON(a), right = parsePythonJSON(b);
    assert.equal(equal(left, right), expected[index][0], `${a} == ${b}`);
    assert.equal(typedEqual(left, right), expected[index][1], `typed ${a} == ${b}`);
  }
  for (const [source, key] of [['-0.0', '0'], ['1.0', '1e0'], ['9007199254740993', '9007199254740993e0'], ['1e23', '1e23']]) {
    const value = parsePythonJSON(source);
    assert(isNumeric(value));
    assert.equal(numberKey(value), key);
  }
  assert.equal(numberKey('١٢.٥٠٠'), '125e-1');
  assert.equal(isNumeric(true), false);
  assert.throws(() => numberKey(true), /Invalid/);
});

test('invalid, ambiguous, cyclic, over-bound and unsupported values fail explicitly', () => {
  for (const source of ['', ' ', '+1', '01', '-01', '1.', '.1', '1e', '1e+', '[1,]', '{"a":1,}',
    'true false', 'NaN', 'Infinity', '-Infinity', '\ufeff{}', '{"x" 1}', '"\n"', '"\\q"']) {
    assert.throws(() => parsePythonJSON(source), SyntaxError, source);
  }
  for (const source of ['1e309', '-1e309']) assert.throws(() => parsePythonJSON(source), /NON_FINITE/);
  const big = '9'.repeat(4300);
  assert.equal(canonical(parsePythonJSON(big)), big);
  assert.throws(() => parsePythonJSON(big + '9'), /INTEGER_DIGIT_BOUND/);
  assert.throws(() => canonical(BigInt(big + '9')), /INTEGER_DIGIT_BOUND/);
  for (const source of ['"\\ud800"', '"\\udfff"', '{"\\ud800":0}']) {
    assert.throws(() => canonical(parsePythonJSON(source)), /LONE_SURROGATE/);
  }
  for (const value of [NaN, Infinity, -Infinity, undefined, () => {}, Symbol('x'), new Date(), new Map(), new Set(), [,]]) {
    assert.throws(() => canonical(value));
  }
  const circular = []; circular.push(circular);
  assert.throws(() => canonical(circular), /CIRCULAR/);
  assert.throws(() => pyStr(circular), /CIRCULAR/);
  assert.throws(() => clonePythonJson(circular), /CIRCULAR/);
  assert.throws(() => canonical({get a() { return 1; }}), /ACCESSORS/);
  assert.throws(() => parsePythonJSON('['.repeat(514) + '0' + ']'.repeat(514)), /DEPTH_BOUND/);
});
