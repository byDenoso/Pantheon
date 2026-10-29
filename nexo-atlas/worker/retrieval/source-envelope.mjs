/**
 * Bounded canonical-source envelope reader. Retains one raw string, outer
 * metadata, and file byte-independent UTF-16 ranges; never constructs the full
 * files object. Each entry() / entries() value is parsed on demand and uncached.
 * The complete source is syntax-validated before any entry can be consumed.
 */
import {parsePythonJSON, record, compareCodepoints} from './python-json.mjs';

const MAX_DEPTH = 512;
const MAX_INTEGER_DIGITS = 4300;
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const HEX4 = /^[0-9a-fA-F]{4}$/;

export function parseSourceEnvelope(rawText) {
  if (typeof rawText !== 'string') throw new TypeError('SOURCE_ENVELOPE_RAW_STRING_REQUIRED');
  let position = 0, fileRanges = null;
  const metadata = record();
  const error = () => { throw new SyntaxError(`SOURCE_ENVELOPE_INVALID_AT_${position}`); };
  const loneSurrogate = () => { throw new RangeError('PYTHON_JSON_LONE_SURROGATE'); };
  function skipSpace() {
    while (position < rawText.length) {
      const ch = rawText.charCodeAt(position);
      if (ch !== 0x20 && ch !== 9 && ch !== 10 && ch !== 13) break;
      position++;
    }
  }
  function hexCodepoint() {
    const hex = rawText.slice(position, position + 4);
    if (!HEX4.test(hex)) return error();
    position += 4;
    return parseInt(hex, 16);
  }
  function string(decode = false) {
    if (rawText[position] !== '"') return error();
    const start = position++;
    while (position < rawText.length) {
      const ch = rawText.charCodeAt(position++);
      if (ch === 0x22) return decode ? JSON.parse(rawText.slice(start, position)) : undefined;
      if (ch < 0x20) return error();
      if (ch === 0x5c) {
        const escape = rawText[position++];
        if (escape === 'u') {
          const cp = hexCodepoint();
          if (cp >= 0xd800 && cp <= 0xdbff) {
            if (rawText[position] !== '\\' || rawText[position + 1] !== 'u') return loneSurrogate();
            position += 2;
            const low = hexCodepoint();
            if (low < 0xdc00 || low > 0xdfff) return loneSurrogate();
          } else if (cp >= 0xdc00 && cp <= 0xdfff) return loneSurrogate();
        } else if (!['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(escape)) return error();
      } else if (ch >= 0xd800 && ch <= 0xdbff) {
        const low = rawText.charCodeAt(position++);
        if (!(low >= 0xdc00 && low <= 0xdfff)) return loneSurrogate();
      } else if (ch >= 0xdc00 && ch <= 0xdfff) return loneSurrogate();
    }
    return error();
  }
  function number() {
    NUMBER.lastIndex = position;
    const match = NUMBER.exec(rawText);
    if (!match) return error();
    position = NUMBER.lastIndex;
    const token = match[0];
    if (/[.eE]/.test(token)) {
      if (!Number.isFinite(Number(token))) throw new RangeError('PYTHON_JSON_NON_FINITE_FLOAT');
    } else if (token.length - (token[0] === '-' ? 1 : 0) > MAX_INTEGER_DIGITS) {
      throw new RangeError('PYTHON_JSON_INTEGER_DIGIT_BOUND');
    }
  }
  function value(depth) {
    if (depth > MAX_DEPTH) throw new RangeError('PYTHON_JSON_DEPTH_BOUND');
    skipSpace();
    const ch = rawText[position];
    if (ch === '"') { string(); return; }
    if (ch === '{') { object(depth, false); return; }
    if (ch === '[') {
      position++; skipSpace();
      if (rawText[position] === ']') { position++; return; }
      for (;;) {
        value(depth + 1); skipSpace();
        if (rawText[position] === ']') { position++; return; }
        if (rawText[position++] !== ',') return error();
      }
    }
    for (const literal of ['true', 'false', 'null']) {
      if (rawText.startsWith(literal, position)) { position += literal.length; return; }
    }
    number();
  }
  function object(depth, captureFiles) {
    if (depth > MAX_DEPTH) throw new RangeError('PYTHON_JSON_DEPTH_BOUND');
    position++; skipSpace();
    const ranges = captureFiles ? new Map() : null;
    if (rawText[position] === '}') { position++; return ranges; }
    for (;;) {
      const key = string(captureFiles); skipSpace();
      if (rawText[position++] !== ':') return error();
      skipSpace();
      const start = position;
      value(depth + 1);
      // Map.set replaces a duplicate's value without moving its original place,
      // exactly like Python json.loads() dictionaries.
      if (captureFiles) ranges.set(key, Object.freeze([start, position]));
      skipSpace();
      if (rawText[position] === '}') { position++; return ranges; }
      if (rawText[position++] !== ',') return error();
      skipSpace();
    }
  }

  skipSpace();
  if (rawText[position++] !== '{') return error();
  skipSpace();
  if (rawText[position] === '}') position++;
  else for (;;) {
    const key = string(true); skipSpace();
    if (rawText[position++] !== ':') return error();
    skipSpace();
    const start = position;
    if (key === 'files' && rawText[position] === '{') fileRanges = object(1, true);
    else {
      value(1);
      if (key === 'files') fileRanges = null;
      else metadata[key] = parsePythonJSON(rawText.slice(start, position));
    }
    skipSpace();
    if (rawText[position] === '}') { position++; break; }
    if (rawText[position++] !== ',') return error();
    skipSpace();
  }
  skipSpace();
  if (position !== rawText.length) return error();
  if (fileRanges === null) throw new TypeError('SOURCE_ENVELOPE_FILES_OBJECT_REQUIRED');

  // Public ranges are a copy: accidental mutation cannot change what entry()
  // returns or make iteration consume an unvalidated source substring.
  const publishedRanges = new Map(fileRanges);
  function entry(path) {
    const range = fileRanges.get(path);
    if (!range) return undefined;
    return parsePythonJSON(rawText.slice(range[0], range[1]));
  }
  function* entries({sorted = false} = {}) {
    const keys = sorted ? [...fileRanges.keys()].sort(compareCodepoints) : fileRanges.keys();
    for (const path of keys) yield [path, entry(path)];
  }
  return Object.freeze({metadata, fileRanges: publishedRanges, entry, entries});
}
