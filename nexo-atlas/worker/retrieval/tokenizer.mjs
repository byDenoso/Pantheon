/**
 * Faithful raw-string port of reviewed nexo-retrieval-1.3.0 tokenization.
 * Unicode and Decimal limits are pinned to the reviewed CPython runtime.
 * No platform normalize/lowercase, model, dependencies, or floating-point numbers.
 * This module does not implement routing, filters, permissions, scoring, or an API.
 */
import { METADATA, TABLES } from './unicode-tables.mjs';

export const TOKENIZER_METADATA = METADATA;
export const MAX_INPUT_UTF16_UNITS = 1_048_576;
const STOP = new Set(TABLES.stop);
const decimalMax = BigInt(METADATA.decimalMaxEmax);
const decimalMin = BigInt(METADATA.decimalMinEtiny);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function checkedString(value) {
  if (typeof value !== 'string') throw new TypeError('Expected a raw text string');
  if (value.length > MAX_INPUT_UTF16_UNITS) throw new RangeError('Tokenizer input exceeds the explicit UTF-16 resource bound');
  return value;
}
function regexRanges(ranges) {
  const esc = cp => `\\u{${cp.toString(16)}}`;
  return ranges.map(([a, b]) => a === b ? esc(a) : `${esc(a)}-${esc(b)}`).join('');
}
const wordClass = regexRanges(TABLES.wordRanges);
const digitClass = regexRanges(TABLES.decimalRanges);
const spaceClass = regexRanges(TABLES.spaceRanges);
const NUMBER_SOURCE = `(?<![${wordClass}.])[+-]?[${digitClass}]+(?:\\.[${digitClass}]+)?(?:[eE][+-]?[${digitClass}]+)?(?![${wordClass}.])`;
const TECH_ID_SOURCE = `(?<![${wordClass}])(?:[A-Za-z][A-Za-z0-9_]*::)?[A-Za-z][A-Za-z0-9_]*(?:[-.:/][A-Za-z0-9_]+)+(?![${wordClass}])`;
const NUMBER = new RegExp(NUMBER_SOURCE, 'gu');
const TECH_ID = new RegExp(TECH_ID_SOURCE, 'gu');
const trimSpace = new RegExp(`^[${spaceClass}]+|[${spaceClass}]+$`, 'gu');

function decomposition(cp) {
  // Unicode's algorithmic full canonical decomposition of Hangul syllables.
  if (cp >= 0xac00 && cp <= 0xd7a3) {
    const s = cp - 0xac00;
    const l = 0x1100 + Math.floor(s / 588);
    const v = 0x1161 + Math.floor((s % 588) / 28);
    const t = s % 28;
    return t ? String.fromCodePoint(l, v, 0x11a7 + t) : String.fromCodePoint(l, v);
  }
  return TABLES.nfkd[cp] ?? String.fromCodePoint(cp);
}

/** Python unicodedata.normalize('NFKD', value).casefold(), then remove ccc != 0. */
export function fold(value) {
  checkedString(value);
  const result = [];
  let pending = [];
  function emit(ch) {
    for (const mapped of TABLES.casefold[ch.codePointAt(0)] ?? ch) {
      if (!TABLES.combining[mapped.codePointAt(0)]) result.push(mapped);
    }
  }
  function flush() {
    // Stable Array.sort is specified by ES2019. Equal classes retain input order.
    pending.sort((a, b) => a[1] - b[1]);
    for (const [ch] of pending) emit(ch);
    pending = [];
  }
  for (const ch of value) {
    for (const decomposed of decomposition(ch.codePointAt(0))) {
      const ccc = TABLES.combining[decomposed.codePointAt(0)] ?? 0;
      if (ccc) pending.push([decomposed, ccc]);
      else {
        if (pending.length) flush();
        emit(decomposed);
      }
    }
  }
  if (pending.length) flush();
  return result.join('');
}

/**
 * Exact finite Decimal-string canonicalization, including Unicode Nd digits and
 * CPython's underscore/whitespace grammar. Numeric JS values are rejected rather
 * than losing precision. Only the string-input subset of Python number_key(Any)
 * is exposed; tokens() always supplies strings. No Number/parseFloat conversion.
 */
export function numberKey(value) {
  checkedString(value);
  let text = value.replace(trimSpace, '').replaceAll('_', '');
  let ascii = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    ascii += hasOwn(TABLES.decimal, cp) ? String(TABLES.decimal[cp]) : ch;
  }
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(ascii);
  if (!match || match[0].length !== ascii.length) throw new RangeError('Invalid or non-finite numeric literal');
  const fraction = match[3] ?? match[4] ?? '';
  let digits = ((match[2] ?? '') + fraction).replace(/^0+/, '') || '0';
  const expText = match[5] ?? '0';
  const negativeExp = expText.startsWith('-');
  const expDigits = expText.replace(/^[+-]/, '').replace(/^0+/, '') || '0';
  // At most 1 Mi UTF-16 input units cannot compensate an exponent this large.
  // Reject before constructing a potentially huge BigInt.
  if (expDigits.length > 20) throw new RangeError('Numeric exponent outside reviewed Decimal bounds');
  let exponent = (negativeExp ? -1n : 1n) * BigInt(expDigits) - BigInt(fraction.length);
  if (exponent < decimalMin || exponent > decimalMax || exponent + BigInt(digits.length - 1) > decimalMax) {
    throw new RangeError('Numeric exponent outside reviewed Decimal bounds');
  }
  if (digits === '0') return '0';
  const stripped = digits.replace(/0+$/, '');
  exponent += BigInt(digits.length - stripped.length);
  return `${match[1] === '-' ? '-' : ''}${stripped}e${exponent}`;
}
export const number_key = numberKey;

/** Ordinary ASCII words, then whole technical identifiers, then canonical numbers. */
export function tokens(value) {
  const folded = fold(value);
  const result = (folded.match(/[a-z0-9_]+/g) ?? []).filter(term => !STOP.has(term));
  // matchAll clones the global regex so concurrent/repeated calls share no cursor.
  for (const match of folded.matchAll(TECH_ID)) result.push(`id:${match[0]}`);
  for (const match of folded.matchAll(NUMBER)) result.push(`num:${numberKey(match[0])}`);
  return result;
}

// Exact raw-string match helpers for retrieval._query_ids and NUMBER.fullmatch.
// They intentionally do not fold identifiers or use JavaScript's Unicode classes.
export function pythonStrip(value) { return checkedString(value).replace(trimSpace, ''); }
export function legacyQueryAliases(value) {
  checkedString(value);
  return [...new Set([pythonStrip(value), ...Array.from(value.matchAll(TECH_ID), m => m[0]),
    ...(value.match(/[A-Za-z][A-Za-z0-9_]{5,}/g) ?? []).filter(v => v.includes('_'))])];
}
export function pureNumber(value) {
  const stripped = pythonStrip(value), matches = Array.from(stripped.matchAll(NUMBER));
  return matches.length === 1 && matches[0].index === 0 && matches[0][0].length === stripped.length
    ? numberKey(matches[0][0]) : null;
}

/** Pinned Python character classes, also used by the reviewed routing regexes. */
export function pythonPattern(source, flags='u') {
  return new RegExp(source.replaceAll('\\b', `(?:(?<![${wordClass}])(?=[${wordClass}])|(?<=[${wordClass}])(?![${wordClass}]))`)
    .replaceAll('\\S', `[^${spaceClass}]`).replaceAll('\\w', `[${wordClass}]`).replaceAll('\\s', `[${spaceClass}]`).replaceAll('\\d', `[${digitClass}]`), flags);
}
const QUERY_ID = new RegExp(`(?<![${wordClass}])[A-Za-z][A-Za-z0-9_.:/-]*`, 'gu');
export function queryAliasCandidates(value) {
  checkedString(value);
  return {whole:pythonStrip(value),words:Array.from(value.matchAll(QUERY_ID),m=>[m[0],m[0].replace(/[.,:;]+$/,'')]),
    underscored:(value.match(/[A-Za-z][A-Za-z0-9_]{5,}/g)??[]).filter(v=>v.includes('_'))};
}
export function queryAliases(value) {
  const c=queryAliasCandidates(value);
  return [...new Set([c.whole,...c.words.flat(),...c.underscored])];
}
export function technicalIdentifiers(value) {return Array.from(checkedString(value).matchAll(TECH_ID),m=>m[0]);}
export function isTechnicalIdentifier(value) {
  const found=technicalIdentifiers(value);return found.length===1&&found[0]===value;
}
