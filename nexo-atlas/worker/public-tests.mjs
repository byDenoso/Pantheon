import {publicationDates} from './public-publication.mjs';
import reviewed from './public-tests.json' with {type: 'json'};
import {isCompletePublicTest} from '../src/atlas/publicCompleteness.ts';

const FIELDS = ['question', 'answers', 'method', 'result'];
const EXCLUDED = /(?:\bolymp[a-z0-9_-]*\b|\boly(?:[-_]|aut|cause|phys|pivot)[a-z0-9_-]*\b|(?<![\p{L}\p{N}])p[. _-]*e[. _-]*e?[. _-]*r(?![\p{L}\p{N}])|\b(?:pcdm|pngb|miq|miqueias)\b)/iu;
const INTERNAL = /(?:https?:\/\/|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:CONTEST-|WORK-|HYP-|T-SCI-|T-META-|ROADMAP-|REQ-|INBOX-|prj_|appgprj_)[A-Z0-9_-]+|\b[a-f0-9]{24,}\b|\b(?:PRIVATE KEY|GOOGLE_REFRESH_TOKEN|NEXO_ATLAS_PIN_HASH|Bearer)\b)/i;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const safeText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 4000 && !EXCLUDED.test(value) && !INTERNAL.test(value);

// Only the explicitly reviewed publication artifact is served. This endpoint
// cannot invoke Drive, inspect Tower, infer approval, or copy private fields.
export function validatePublicTests(rows) {
  if (!Array.isArray(rows) || rows.length > 1000) throw new Error('PUBLIC_PROJECTION_INVALID');
  return rows.map(row => {
    if (!object(row) || Object.keys(row).sort().join(',') !== FIELDS.slice().sort().join(',')) throw new Error('PUBLIC_PROJECTION_INVALID');
    const out = {};
    for (const key of FIELDS) {
      const value = row[key];
      if (!object(value) || Object.keys(value).sort().join(',') !== 'en,pt-BR' || !safeText(value['pt-BR']) || !safeText(value.en)) throw new Error('PUBLIC_PROJECTION_INVALID');
      out[key] = Object.freeze({'pt-BR': value['pt-BR'], en: value.en});
    }
    return Object.freeze(out);
  });
}
const tests = Object.freeze(validatePublicTests(reviewed).filter(isCompletePublicTest));
export function publicAtlasProjection() {return {contract: 'ATLAS_PUBLIC_V1', items: [], links: [], tests: tests.map(row => ({...row, ...publicationDates(row)}))};}
