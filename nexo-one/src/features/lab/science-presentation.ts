import type { TestEntity } from './model.ts';
import { hasPublishedValue } from './presentation.ts';

/** Published values only. No significance, uncertainty or verdict is calculated here. */
export function numbersOf(test: TestEntity): Record<string, number> {
  const out: Record<string, number> = {};
  const unwrap = (value: unknown): unknown => value && typeof value === 'object' && 'value' in value
    ? unwrap((value as { value: unknown }).value) : value;
  const scan = (raw: unknown) => {
    const value = unwrap(raw);
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      const number = unwrap(item);
      if (typeof number === 'number' && Number.isFinite(number)) out[key] = number;
    }
  };
  const result = unwrap(test.result) as { statistics?: unknown } | null;
  scan(test.statistics); scan(result?.statistics); scan(result);
  return out;
}

function selectionDate(test: TestEntity): { time: number; reason: string } {
  for (const [value, label] of [[test.executedAt, 'execução'], [test.createdAt, 'criação do registro (a data de execução não foi publicada)']] as const) {
    const time = value ? Date.parse(value) : NaN;
    if (Number.isFinite(time)) return { time, reason: `Data usada: ${label}, ${value}.` };
  }
  return { time: -Infinity, reason: 'Sem data utilizável publicada; desempate por identificador, sem inferir recência.' };
}

/** Call with the scientific population. Eligibility here concerns display, not runtime readiness. */
export function selectScienceFocus(tests: TestEntity[]): { test: TestEntity; reason: string } | null {
  const candidates = tests.filter(test => !test.contestOf && !test.historical
    && ['CONFIRMED', 'REVIEW', 'PROVISIONAL', 'REFUTED'].includes(test.verdict)
    && (test.meaning || Object.keys(numbersOf(test)).length || hasPublishedValue(test.result)));
  const confirmed = candidates.filter(test => test.verdict === 'CONFIRMED' && test.review?.toUpperCase() === 'CONFIRMED');
  const provisional = candidates.filter(test => test.verdict === 'REVIEW' || test.verdict === 'PROVISIONAL');
  const pool = confirmed.length ? confirmed : provisional.length ? provisional : candidates;
  const test = [...pool].sort((a, b) => {
    const aTime = selectionDate(a).time, bTime = selectionDate(b).time;
    return aTime === bTime ? a.id.localeCompare(b.id) : aTime > bTime ? -1 : 1;
  })[0];
  if (!test) return null;
  const basis = confirmed.length
    ? 'Prioridade aos resultados confirmados pela revisão publicada, ordenados pelas datas disponíveis.'
    : provisional.length
      ? 'Sem resultado confirmado disponível para destaque; exibimos um resultado provisório ou em revisão, pelas datas disponíveis.'
      : 'Sem resultado confirmado ou provisório disponível para destaque; exibimos o registro refutado pelas datas disponíveis.';
  return { test, reason: `${basis} ${selectionDate(test).reason} A magnitude dos números não determina a seleção nem a confiança científica.` };
}

const STAT_PT: Record<string, (value: number) => [string, string]> = {
  delta_chi2: value => [`Δχ² = ${value.toFixed(1)}`, 'Diferença de ajuste publicada; a ordem da subtração não está declarada neste campo. Na convenção χ²(modelo) − χ²(referência), valores negativos indicam melhora de ajuste. Δχ² isolado não inclui penalização de complexidade nem validação completa.'],
  delta_chi2_lcdm_minus_w0wa: value => [`Δχ²(ΛCDM − w0wa) = ${value.toFixed(1)}`, `${value > 0 ? 'O ajuste w0wa tem χ² menor' : value < 0 ? 'O ajuste ΛCDM tem χ² menor' : 'Os ajustes têm o mesmo χ²'} nesta análise publicada. Essa diferença isolada não inclui penalização de complexidade nem validação completa.`],
  p_value: value => [`p = ${value < 0.001 ? value.toExponential(1) : value.toFixed(3)}`, value < 0 || value > 1 ? 'Valor publicado fora do intervalo válido de p (0 a 1); consulte a origem.' : 'Sob a hipótese nula e as suposições do teste, probabilidade de uma estatística tão extrema quanto a observada ou mais. Não é a probabilidade de a hipótese ser verdadeira.'],
  sigma_raw: value => [`${value.toFixed(1)}σ (bruta)`, 'Significância bruta publicada; não equivale a confirmação ou descoberta.'],
  sigma_lee: value => [`${value.toFixed(1)}σ (corrigida)`, 'Significância publicada com correção look-elsewhere; depende do escopo da correção e não equivale a confirmação ou descoberta.'],
  delta_bic: value => [`ΔBIC = ${value.toFixed(1)}`, 'Comparação com penalização de complexidade publicada. A direção depende da ordem dos modelos; não representa probabilidade de uma hipótese.'],
  ln_bayes_factor: value => [`ln B = ${value.toFixed(2)}`, 'Logaritmo da razão de evidências publicada; depende da ordem dos modelos e dos priors usados. Não é uma probabilidade posterior da hipótese.'],
  shift_sigma: value => [`deslocamento ${value.toFixed(1)}σ`, 'Deslocamento padronizado publicado; a leitura depende da definição da análise.'],
};

export function scientificStatRows(test: TestEntity): Array<[string, string]> {
  return Object.entries(numbersOf(test)).filter(([key]) => STAT_PT[key]).map(([key, value]) => STAT_PT[key]!(value));
}
