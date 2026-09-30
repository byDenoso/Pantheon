import type { AutonomyMetrics, PublishedAutonomyMetric } from '../../contracts/system.ts';

interface MetricCard { value: string; label: string; description: string; base: string }
const ratio = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? `${Math.round(value * 100)}%` : '—';
const count = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const hasCounts = (metric: PublishedAutonomyMetric): boolean => count(metric.numerator) && count(metric.denominator) && metric.numerator <= metric.denominator;
const base = (metric?: PublishedAutonomyMetric) => metric && hasCounts(metric)
  ? `${metric.numerator} / ${metric.denominator} registros${metric.denominator === 0 ? ' · sem casos nessa base' : ''}`
  : 'Numerador e denominador não publicados';

/** Render the producer's cohorts; never reconstruct them from a differently enriched public projection. */
export function autonomyPresentation(a: AutonomyMetrics): { legacy: boolean; recent: MetricCard[]; inventory: MetricCard[]; outcomes: Array<[string, number]> } {
  const legacy = a.schema_version !== 'AUTONOMY_METRICS_V2';
  const metric = (key: string): PublishedAutonomyMetric | undefined => {
    const item = legacy ? undefined : a.metrics?.[key];
    const scope = ['positive_review_closure', 'blocked_share'].includes(key) ? 'all_tests' : 'window';
    const unit = key === 'median_hours_to_result' ? 'hours' : 'ratio';
    return item?.scope === scope && item.unit === unit && typeof item.definition === 'string' && item.definition.trim() ? item : undefined;
  };
  const ratioValue = (key: string, old: number | null) => {
    if (legacy) return ratio(old);
    const item = metric(key);
    return item && hasCounts(item) && item.denominator! > 0 ? ratio(item.value) : '—';
  };
  const latencyMetric = metric('median_hours_to_result');
  const coverage = latencyMetric?.coverage;
  const coverageValid = coverage && count(coverage.numerator) && count(coverage.denominator) && coverage.numerator <= coverage.denominator;
  const latency = legacy ? a.median_hours_to_result : coverageValid && coverage.numerator > 0 && latencyMetric?.sample_count === coverage.numerator ? latencyMetric.value : null;
  return {
    legacy,
    outcomes: legacy ? [] : Object.entries(a.buckets?.result_verdicts ?? {}).filter((entry): entry is [string, number] => count(entry[1])).sort(([a], [b]) => a.localeCompare(b)),
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
      { value: ratioValue('blocked_share', a.false_block_share), label: 'Bloqueados entre READY e BLOCKED',
        description: 'BLOCKED* dividido por READY + BLOCKED*. Exclui os outros estados de TEST e a fila de WORK. Não mede bloqueios falsos nem a fração de todos os testes.', base: base(metric('blocked_share')) },
    ],
  };
}
