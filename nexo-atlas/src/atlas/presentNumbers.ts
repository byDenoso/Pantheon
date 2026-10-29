// Presentation-only numeral localisation for published labels.
// The catalog, CSV/SVG exports, identifiers and URLs keep their exact bytes: this
// helper is applied only where a label is drawn as visible interface text.
import type {Locale} from './api.ts';

// A standalone decimal such as "0.01" in "z = 0.01–0.15". It must not be part of an
// identifier or version ("v1.5", "DR2.1", "1.2.3"), a DOI/arXiv id ("10.1103/…",
// "arXiv:2404.03002") or a URL, so the number has to start after whitespace, an
// opening bracket, a comparison/range sign, or a digit followed by a range dash.
const STANDALONE_DECIMAL = /(?<=^|[\s(\[=–—−±<>≤≥~≈;]|\d[-–])(\d+)\.(\d+)(?![\p{L}\p{N}_/]|\.\d)/gu;
// Catalog configuration labels sometimes carry ", ·" where two fragments were joined.
const STRAY_SEPARATOR = /,(\s*·)/g;

/** Returns the label as it should be shown. Never use the result for exports or keys. */
export function presentLabel(text: string, locale: Locale): string {
  if (!text) return text;
  const tidy = text.replace(STRAY_SEPARATOR, '$1');
  return locale === 'pt-BR' ? tidy.replace(STANDALONE_DECIMAL, '$1,$2') : tidy;
}

/**
 * Tells apart rows whose visible label is identical. Equal names never merge two
 * records: each keeps its own identity and receives an explicit ordinal.
 * Returns, per input index, `null` for a unique label or `{index, of}` (1-based).
 */
export function duplicateOrdinals(labels: readonly string[]): ({index: number; of: number} | null)[] {
  const total = new Map<string, number>();
  for (const label of labels) total.set(label, (total.get(label) ?? 0) + 1);
  const seen = new Map<string, number>();
  return labels.map(label => {
    const of = total.get(label)!;
    if (of < 2) return null;
    const index = (seen.get(label) ?? 0) + 1;
    seen.set(label, index);
    return {index, of};
  });
}
