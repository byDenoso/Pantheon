// Turns machine-written Tower cells into reader-facing text. The raw cell is never
// rewritten or lost: it is returned as `technical` for a collapsed "technical details".
// Rules: an ID-like title is hidden; a pipe-separated code line keeps only the flags a
// reader can use; JSON numbers become at most three named values; plain text passes through.

export type Humanized = {title: string; body: string; metrics: string[]; technical: string | null};

const ID_LIKE = /^(?:[0-9a-f]{16,}[-_]|[A-Z0-9]+(?:[-_][A-Z0-9]+){3,}$)/i;
export const isIdLike = (s: string) => { const v = s.trim(); return v.length > 0 && !/\s/.test(v) && (ID_LIKE.test(v) || (v.length > 28 && /[-_|]/.test(v))); };
export const isCodeLine = (s: string) => { const v = s.trim(); if (!v || /\s[a-zà-ú]{3,}\s/.test(v)) return false; const letters = v.replace(/[^A-Za-z]/g, ''); return /[|_]/.test(v) && letters.length > 0 && letters.replace(/[^A-Z]/g, '').length / letters.length > .7; };
const asJson = (s: string): Record<string, unknown> | null => { const v = s.trim(); if (!v.startsWith('{')) return null; try { const o = JSON.parse(v); return o && typeof o === 'object' && !Array.isArray(o) ? o as Record<string, unknown> : null; } catch { return null; } };

const FLAGS: [RegExp, string][] = [
  [/^(NOVELTY_NOT_DEMONSTRATED|NOVIDADE_NAO_DEMONSTRADA)$/, 'novidade ainda não demonstrada'],
  [/^(NOVELTY_DEMONSTRATED|NOVIDADE_DEMONSTRADA)$/, 'novidade demonstrada'],
  [/^T0(?:_|$)/, 'construção teórica'],
  [/^E0(?:_|$)/, 'teste exploratório'], [/^E1(?:_|$)/, 'reprodução'], [/^E2(?:_|$)/, 'confirmação prospectiva'],
  [/^(HOLD|EM_ESPERA)$/, 'em espera'], [/^LOCAL_ONLY$/, 'pacote ainda só local'],
  [/^(REFUTED|REFUTADO)$/, 'refutado'], [/^(SUPPORTED|SUSTENTADO)$/, 'sustentado'], [/^(INCONCLUSIVE|INCONCLUSIVO)$/, 'inconclusivo'],
  [/NOT_INDEPENDENT|NAO_INDEPENDENTE/, 'não é independente do que já existe'],
  [/NO_SEPARATION|SEM_SEPARACAO/, 'não separa os modelos'],
  [/DISAPPEARS|DESAPARECE/, 'a vantagem desaparece num controle'],
  [/WORSE|PIORA/, 'piora o ajuste'],
  [/MILD_IMPROVEMENT|MELHORA_LEVE/, 'melhora leve do ajuste'],
];
const flagsOf = (code: string) => { const out: string[] = []; for (const token of code.split('|').map(t => t.trim()).filter(Boolean)) { const hit = FLAGS.find(([re]) => re.test(token)); if (hit && !out.includes(hit[1])) out.push(hit[1]); } return out; };

const KEY_RE = /delta|dchi|chi2|sigma|bayes|ln_?z|signif|tension/i;
const nice = (k: string) => k.replace(/(^|_)delta_?/gi, '$1Δ ').replace(/chi2/gi, 'χ²').replace(/LCDM/g, 'ΛCDM').replace(/_minus_/g, ' − ').replace(/_vs_/g, ' vs ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
const fmt = (n: number) => Math.abs(n) >= 1000 || (Math.abs(n) < 0.01 && n !== 0) ? n.toExponential(2).replace('.', ',') : n.toLocaleString('pt-BR', {maximumFractionDigits: 3});
export function metricsOf(numeros: string): string[] {
  const o = asJson(numeros);
  if (!o) return numeros.trim() && !isCodeLine(numeros) ? [numeros.trim()] : [];
  return Object.entries(o).filter(([k, v]) => typeof v === 'number' && Number.isFinite(v) && KEY_RE.test(k)).slice(0, 3).map(([k, v]) => `${nice(k)} = ${fmt(v as number)}`);
}

const firstSentence = (s: string) => { const m = /^(.+?[?.!])(\s+|$)([\s\S]*)$/.exec(s.trim()); return m ? [m[1]!, m[3]!.trim()] as const : [s.trim(), ''] as const; };

export function humanizeResult(row: {titulo?: string; resultado?: string; numeros?: string; task?: string}, who = ''): Humanized {
  const titulo = (row.titulo ?? '').trim(), resultado = (row.resultado ?? '').trim(), numeros = (row.numeros ?? '').trim();
  const rawParts = [isIdLike(titulo) ? titulo : '', isCodeLine(resultado) || asJson(resultado) ? resultado : '', asJson(numeros) ? numeros : ''].filter(Boolean);
  const technical = rawParts.length ? rawParts.join('\n') : null;
  const metrics = metricsOf(numeros);
  if (resultado && !isCodeLine(resultado) && !asJson(resultado)) {
    const [first, rest] = firstSentence(resultado);
    if (first.endsWith('?')) return {title: first, body: rest, metrics, technical};
    return {title: isIdLike(titulo) ? '' : titulo, body: resultado, metrics, technical};
  }
  const flags = flagsOf(resultado);
  const title = isIdLike(titulo) || !titulo ? `Resultado técnico${who ? ` de ${who}` : ''}` : titulo;
  const body = flags.length ? `${flags[0]!.charAt(0).toUpperCase()}${flags[0]!.slice(1)}${flags.length > 1 ? `; ${flags.slice(1).join('; ')}` : ''}.` : 'Registro técnico sem resumo em linguagem corrente.';
  return {title, body, metrics, technical};
}

/** A heading for roadmap/front rows: the human title, or nothing when only an ID is available. */
export const humanTitle = (titulo: string, fallback: string) => isIdLike(titulo) || isCodeLine(titulo) ? fallback : titulo;
