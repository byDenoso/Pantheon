import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pythonUpper, pythonLower, pythonIsDigit, PRODUCER_UNICODE_METADATA} from '../worker/retrieval/producer-unicode.mjs';

function oracle(script) {
  const result = spawnSync(process.env.PYTHON || 'python3', ['-c', script], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('pinned upper/lower/isdigit match Python at every Unicode code point', () => {
  const expected = oracle(`import json,unicodedata
assert unicodedata.unidata_version=='15.0.0'
changed={}
for cp in range(0x110000):
 ch=chr(cp)
 if ch.upper()!=ch or ch.lower()!=ch or ch.isdigit():changed[str(cp)]=[ch.upper(),ch.lower(),ch.isdigit()]
print(json.dumps(changed,ensure_ascii=True))`);
  assert.equal(PRODUCER_UNICODE_METADATA.unicodeVersion, '15.0.0');
  assert.match(PRODUCER_UNICODE_METADATA.dataSha256, /^[0-9a-f]{64}$/);
  assert(Object.keys(expected).length > 2800);
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    const ch = String.fromCodePoint(cp), mappings = expected[cp];
    assert.equal(pythonUpper(ch), mappings?.[0] ?? ch, `upper U+${cp.toString(16)}`);
    assert.equal(pythonLower(ch), mappings?.[1] ?? ch, `lower U+${cp.toString(16)}`);
    assert.equal(pythonIsDigit(ch), mappings?.[2] ?? false, `isdigit U+${cp.toString(16)}`);
  }
});

test('isdigit handles whole strings and superscript/numeric categories exactly', () => {
  for (const text of ['123', '١٢٣', '²³', '𝟙𝟚', '123١²𝟙']) assert.equal(pythonIsDigit(text), true, text);
  for (const text of ['', '-1', '+1', '1.0', ' 1', '1 ', 'Ⅻ', '四', '①A', '\u{10d40}']) assert.equal(pythonIsDigit(text), false, text);
  assert.throws(() => pythonIsDigit(1), /STRING_REQUIRED/);
});

test('lower matches Python Final_Sigma with all cased and case-ignorable characters', () => {
  const cases = oracle(`import json,unicodedata
assert unicodedata.unidata_version=='15.0.0'
result=[]
for cp in range(0x110000):
 ch=chr(cp)
 cased=ch.islower() or ch.isupper() or ch.istitle()
 ignorable=('AΣ'+ch+'A').lower()[1]=='σ' and ('.'+ch+'Σ').lower()[-1]=='σ'
 if cased or ignorable:
  for text in ['AΣ'+ch+'A','.'+ch+'Σ','AΣ'+ch,'A'+ch+'Σ']:
   result.append([text,text.lower()])
print(json.dumps(result,ensure_ascii=True))`);
  assert(cases.length > 20000);
  for (const [source, expected] of cases) assert.equal(pythonLower(source), expected, JSON.stringify(source));
  for (const [source, expected] of [
    ['Σ', 'σ'], ['ΑΣ', 'ας'], ['ΑΣΑ', 'ασα'], ['AΣ\u0301', 'aς\u0301'],
    ['AΣ\u0301A', 'aσ\u0301a'], ['AΣ\u0345', 'aς\u0345'],
    ['.\u0345Σ', '.\u0345σ'], ["AΣ'A", "aσ'a"], ['AΣ A', 'aς a'],
  ]) assert.equal(pythonLower(source), expected);
});

test('default full casing preserves reviewed expansions and newer unassigned mappings', () => {
  assert.equal(pythonUpper('straße ﬃ ı ſ'), 'STRASSE FFI I S');
  assert.equal(pythonLower('İ K ẞ'), 'i\u0307 k ß');
  // Vithkuqi is already assigned in Unicode 15 and must map as reviewed.
  assert.equal(pythonLower('\u{10570}'), '\u{10597}');
  assert.equal(pythonUpper('\u{10597}'), '\u{10570}');
  // Cyrillic Tje and Garay casing were added after Unicode 15. Native Node
  // casing may transform them, but the reviewed producer must leave them alone.
  for (const ch of ['\u1c89', '\u1c8a', '\ua7cb', '\ua7cc', '\ua7cd', '\u{10d50}', '\u{10d70}']) {
    assert.equal(pythonUpper(ch), ch);
    assert.equal(pythonLower(ch), ch);
  }
  // U+0264 existed in Unicode 15, but acquired an uppercase partner later.
  assert.equal(pythonUpper('\u0264'), '\u0264');
  assert.equal(pythonLower(''), '');
  assert.equal(pythonUpper(''), '');
  assert.throws(() => pythonLower(null), /STRING_REQUIRED/);
  assert.throws(() => pythonUpper(1), /STRING_REQUIRED/);
});
