import type { CompletenessModel, CompletenessState } from '../data/completeness-model';

function stateLabel(state: CompletenessState): string {
  if (state === 'PUBLISHED') return 'PUBLICADO';
  if (state === 'EMPTY') return 'VAZIO';
  if (state === 'NOT_PUBLISHED') return 'NÃO PUBLICADO';
  return 'INDISPONÍVEL';
}

export function CompletenessOverview({ model }: { model: CompletenessModel | null }) {
  if (!model) return <section className="cockpit-section completeness-overview" aria-label="Completude do Atlas" aria-busy="true"><div className="cockpit-section-heading"><div><span className="eyebrow">COBERTURA</span><h2>Completude da leitura</h2></div></div><p className="cockpit-empty">Lendo os campos publicados pelas superfícies…</p></section>;
  return <section className="cockpit-section completeness-overview" aria-label="Completude do Atlas">
    <div className="cockpit-section-heading"><div><span className="eyebrow">COBERTURA / FONTE</span><h2>Completude da leitura</h2></div><span className="cockpit-section-note">Sem números inventados</span></div>
    <div className="completeness-metrics">{model.metrics.map(metric => <article key={metric.id} data-state={metric.state}><strong>{metric.value ?? '—'}</strong><span>{metric.label}</span><small>{stateLabel(metric.state)} · {metric.detail}</small></article>)}</div>
    <div className="completeness-gaps"><div className="completeness-gap-heading"><b>Campos que ainda dependem da fonte</b><span>cada ausência tem motivo</span></div>{model.gaps.map(gap => <article key={gap.id} data-state={gap.state}><span className="completeness-status">{stateLabel(gap.state)}</span><div><b>{gap.label}</b><small>{gap.detail}</small></div></article>)}</div>
  </section>;
}
