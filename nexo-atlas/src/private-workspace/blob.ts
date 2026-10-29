// Binary attachments stored as text (JSON chunks with data_base64, or bare base64) must never be printed as a wall of characters.
import type {Lang} from '../i18n/state-language.ts';

const B64 = /^[A-Za-z0-9+/_-]{256,}={0,2}$/;
const kb = (chars: number, lang: Lang) => (chars / 1024).toLocaleString(lang === 'en' ? 'en-US' : 'pt-BR', {maximumFractionDigits: 1, minimumFractionDigits: 1});
const bare = (text: string) => text.replace(/[\r\n]+/g, '');

function chunkOf(text: string): {data: string; index: number | null; count: number | null} | null {
  if (!text.includes('data_base64')) return null;
  try {
    const v = JSON.parse(text) as Record<string, unknown>;
    if (!v || typeof v !== 'object' || typeof v.data_base64 !== 'string') return null;
    const n = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : null;
    return {data: v.data_base64, index: n(v.chunk_index), count: n(v.chunk_count)};
  } catch { return null; }
}

/** Short summary when the text is a binary attachment, otherwise null. */
export function describeBlob(text: unknown, lang: Lang): string | null {
  if (typeof text !== 'string' || text.length < 256) return null;
  const chunk = chunkOf(text);
  if (chunk) {
    const size = kb(chunk.data.length, lang);
    if (lang === 'en') return `Binary attachment in parts: part ${chunk.index === null ? '?' : chunk.index + 1} of ${chunk.count ?? '?'}, ≈ ${size} KB encoded`;
    return `Anexo binário em partes: parte ${chunk.index === null ? '?' : chunk.index + 1} de ${chunk.count ?? '?'}, ≈ ${size} KB codificados`;
  }
  const b = bare(text);
  if (!B64.test(b)) return null;
  return lang === 'en' ? `Binary attachment, ≈ ${kb(b.length, lang)} KB encoded` : `Anexo binário, ≈ ${kb(b.length, lang)} KB codificados`;
}

/** JSON for display: any blob string inside is replaced by its summary. */
export function displayJson(value: unknown, lang: Lang = 'pt-BR'): string {
  return JSON.stringify(value, (_key, v) => describeBlob(v, lang) ?? v, 2);
}
