import type { AutonomyMetrics, PublishedAutonomyMetric } from '../../contracts/system.ts';

interface MetricCard { value: string; label: string; description: string; base: string }
const ratio = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? `${Math.round(value * 100)}%` : '—';
const count = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const hasCounts = (metric: PublishedAutonomyMetric): boolean => count(metric.numerator) && count(metric.denominator) && metric.numerator <= metric.denominator;
const base = (metric?: PublishedAutonomyMetric) => metric && hasCounts(metric)
  ? `${metric.numerator} / ${metric.denominator} registros${metric.denominator === 0 ? ' · sem casos nessa base' : ''}`
  : 'Numerador e denominador não publicados';

/** Render the producer's cohorts; never reconstruct them from a differently enriched public projection. */
export function autonomyPresentation(a: AutonomyMetrics): { legacy: boolean; recent: MetricCard[]; inventory: MetricCard[]; outcomes: Array<[string, number]>; results: number | null; resultDiscrepancy: string | null } {
  const legacy = a.schema_version !== 'AUTONOMY_METRICS_V2';
  const metric = (key: string): PublishedAutonomyMetric | undefined => {
    const item = legacy ? undefined : a.metrics?.[key];
    const scope = ['positive_review_closure', 'blocked_share'].includes(key) ? 'all_tests' : 'window';
    const unit = key === 'results' ? 'count' : key === 'median_hours_to_result' ? 'hours' : 'ratio';
    return item?.scope === scope && item.unit === unit && typeof item.definition === 'string' && item.definition.trim() ? item : undefined;
  };
  const ratioValue = (key: string, old: number | null) => {
    if (legacy) return ratio(old);
    const item = metric(key);
    // V2 values are rounded to three decimals by the producer. Reject larger disagreements.
    const consistent = item && hasCounts(item) && item.denominator! > 0 && typeof item.value === 'number'
      && Math.abs(item.value - item.numerator! / item.denominator!) <= 0.00051;
    // Display the producer's own published fraction to avoid double rounding at .5%.
    return consistent ? ratio(item.numerator! / item.denominator!) : '—';
  };
  const latencyMetric = metric('median_hours_to_result');
  const queueMetric = metric('blocked_share');
  const queuePercentage = ratioValue('blocked_share', a.false_block_share);
  const coverage = latencyMetric?.coverage;
  const coverageValid = coverage && count(coverage.numerator) && count(coverage.denominator) && coverage.numerator <= coverage.denominator;
  const latency = legacy ? a.median_hours_to_result : coverageValid && coverage.numerator > 0 && latencyMetric?.sample_count === coverage.numerator ? latencyMetric.value : null;
  const outcomes = legacy ? [] : Object.entries(a.buckets?.result_verdicts ?? {}).filter((entry): entry is [string, number] => count(entry[1])).sort(([a], [b]) => a.localeCompare(b));
  const rawBuckets = !legacy ? a.buckets?.result_verdicts : undefined;
  const bucketTotal = rawBuckets && typeof rawBuckets === 'object' && !Array.isArray(rawBuckets) && Object.values(rawBuckets).every(count)
    ? outcomes.reduce((sum, [, n]) => sum + n, 0) : null;
  const resultMetric = metric('results');
  const metricTotal = resultMetric && count(resultMetric.value) && resultMetric.numerator === resultMetric.value && resultMetric.denominator === null ? resultMetric.value : null;
  const metricConflict = metricTotal !== null && bucketTotal !== null && metricTotal !== bucketTotal;
  const results = legacy ? count(a.results) ? a.results : null : metricConflict ? null : metricTotal ?? bucketTotal;
  const discrepancies: string[] = [];
  if (metricConflict) discrepancies.push(`O contador V2 declara ${metricTotal} resultados; os vereditos V2 somam ${bucketTotal}. O total está indisponível até conferir a origem.`);
  if (!legacy && results !== null && count(a.results) && a.results !== results) discrepancies.push(`O contador legado declara ${a.results}; o total V2 publicado é ${results}.`);
  if (rawBuckets && bucketTotal === null) discrepancies.push('Os vereditos V2 contêm contagens inválidas; sua soma não foi usada como total.');
  return {
    legacy,
    outcomes, results, resultDiscrepancy: discrepancies.length ? discrepancies.join(' ') : null,
    recent: [
      { value: ratioValue('execution_record_share', a.robot_share), label: 'Com execução ou família registrada',
        description: 'Presença de registro de execução ou vínculo a uma família. A participação de pessoas e agentes não é medida por esse indicador.', base: base(metric('execution_record_share')) },
      { value: typeof latency === 'number' && Number.isFinite(latency) && latency >= 0 ? `${latency} h` : '—', label: 'Do cadastro à execução',
        description: 'Mediana dos pares de datas válidos. O cadastro pode ser a primeira observação do teste; não é a data da ideia.',
        base: coverageValid ? `${coverage.numerator} / ${coverage.denominator} resultados com datas válidas${coverage.numerator === 0 ? ' · mediana indisponível' : ''}` : 'Cobertura de datas não publicada; — indica mediana indisponível' },
      { value: ratioValue('decisive_rate', a.decisive_rate), label: legacy ? 'Não inconclusivos (legado)' : 'Com desfecho explícito',
        description: legacy ? 'Indicador antigo exclui apenas INCONCLUSIVE/INCONCLUSIVO; pode incluir CONTESTED. Não mede confirmação científica.' : 'PROMOTED/PROMOVIDO, REJECTED/REJEITADO, CONFIRMED ou REFUTED. Outros vereditos, como CONTESTED, ficam fora; promoção ainda depende da revisão.',
        base: base(metric('decisive_rate')) },
    ],
    inventory: [
      { value: ratioValue('positive_review_closure', a.contest_closure), label: 'Positivos com revisão encerrada',
        description: 'Entre os resultados PROMOTED/PROMOVIDO/SUPPORTED, revisão CONFIRMED ou REFUTED. Inclui positivos posteriormente refutados.', base: base(metric('positive_review_closure')) },
      { value: !legacy && queueMetric && queuePercentage !== '—' ? `${queueMetric.numerator} / ${queueMetric.denominator}` : queuePercentage, label: 'Bloqueados entre READY e BLOCKED',
        description: 'BLOCKED* dividido por READY + BLOCKED*. Exclui os outros estados de TEST e a fila de WORK. Não mede bloqueios falsos nem a fração de todos os testes.',
        base: base(queueMetric) + (!legacy && queuePercentage !== '—' ? ` · ${queuePercentage} nessa base publicada` : '') },
    ],
  };
}

/** Disclose a producer/read-model disagreement without overwriting its metric. */
export function publishedQueueGap(a: AutonomyMetrics, tests: Record<string, Record<string, unknown>>) {
  const metric = a.schema_version === 'AUTONOMY_METRICS_V2' ? a.metrics?.blocked_share : undefined;
  if (!metric || metric.scope !== 'all_tests' || !hasCounts(metric) || !Object.keys(tests).length) return null;
  const statuses = Object.values(tests).map(test => String(test.status ?? test.state ?? '').toUpperCase());
  const blocked = statuses.filter(status => status.startsWith('BLOCKED')).length;
  const ready = statuses.filter(status => status === 'READY').length;
  return blocked === metric.numerator && blocked + ready === metric.denominator ? null
    : { blocked, ready, publishedBlocked: metric.numerator!, publishedBase: metric.denominator! };
}
