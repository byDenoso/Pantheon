import { useMemo } from 'react';
import type {
  DatasetMeasurement,
  DirectionalSignal,
  FreshnessState,
  ParameterEstimate,
  PanelState,
  Provenance,
  ResearchRecord,
  ScientificStatus,
  TensionResult,
  Uncertainty,
  WeightedH0Estimate
} from '../api/types';
import { formatDate, formatEstimate, formatInterval, formatNumber, formatUncertainty } from '../science-format';

export function FreshnessBadge({ freshness }: { freshness: FreshnessState }) {
  const label = freshness.state === 'LIVE' ? 'LIVE' : freshness.state;
  return <span className={`freshness-badge freshness-${freshness.state.toLowerCase()}`} title={[freshness.source, freshness.sourceVersion, freshness.updatedAt && formatDate(freshness.updatedAt)].filter(Boolean).join(' · ')}>
    <i aria-hidden="true" /> {label}
  </span>;
}

export function ScientificStatusBadge({ status }: { status: ScientificStatus | string | undefined }) {
  const normalized = String(status || 'UNKNOWN').toUpperCase();
  return <span className={`scientific-status status-${normalized.toLowerCase()}`} title="Estado publicado pela fonte; não é uma conclusão inferida pela interface.">
    <span aria-hidden="true">{normalized === 'SUPPORTED' || normalized === 'MEASURED' ? '✓' : normalized === 'BLOCKED' || normalized === 'CONTRADICTED' ? '!' : normalized === 'UNKNOWN' ? '·' : '◇'}</span> {normalized}
  </span>;
}

export function PanelFrame({ id, icon, title, subtitle, action, freshness, children, className = '' }: {
  id?: string;
  icon?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  freshness?: FreshnessState;
  children: React.ReactNode;
  className?: string;
}) {
  return <article id={id} className={`atlas-panel ${className}`}>
    <header className="panel-header">
      <div className="panel-title-wrap"><span className="panel-icon" aria-hidden="true">{icon || '·'}</span><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>
      <div className="panel-actions">{freshness && <FreshnessBadge freshness={freshness}/>} {action}</div>
    </header>
    <div className="panel-body">{children}</div>
  </article>;
}

export function PanelStateView({ state, empty, children }: { state: PanelState; empty: string; children?: React.ReactNode }) {
  if (state === 'LOADING') return <div className="panel-skeleton" aria-label="Carregando dados"><span/><span/><span/></div>;
  if (state === 'EMPTY') return <div className="panel-empty"><span className="empty-glyph" aria-hidden="true">∅</span><p>{empty}</p><small>Nenhum dado foi inventado para preencher este painel.</small></div>;
  if (state === 'API_ERROR' || state === 'DATA_UNAVAILABLE') return <div className="panel-empty panel-error"><span className="empty-glyph" aria-hidden="true">!</span><p>Dados indisponíveis neste momento.</p><small>A fonte não respondeu; a navegação do Atlas continua disponível.</small></div>;
  return <>{children}</>;
}

export function ProvenanceDrawer({ open, title = 'Proveniência', items, onClose, onNavigate }: {
  open: boolean;
  title?: string;
  items: Provenance[];
  onClose: () => void;
  onNavigate?: (ref: Provenance) => void;
}) {
  if (!open) return null;
  return <div className="drawer-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="provenance-drawer" role="dialog" aria-modal="true" aria-label={title}>
      <header className="drawer-header"><div><span className="eyebrow">DATA LINEAGE</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar proveniência">×</button></header>
      <div className="drawer-body">
        {items.length === 0 ? <div className="panel-empty"><p>Fonte detalhada não publicada para esta projeção.</p></div> : items.map((ref, index) => <button className="provenance-row" key={`${ref.sourceId || ref.sourceRef || ref.source || 'ref'}-${index}`} onClick={() => onNavigate?.(ref)}>
          <span className="provenance-mark" aria-hidden="true">ⓘ</span><span><b>{ref.label || ref.source || 'Fonte publicada'}</b><small>{[ref.sourceId, ref.sourceRef, ref.observedAt && formatDate(ref.observedAt)].filter(Boolean).join(' · ') || 'Referência sem identificador textual'}</small></span><span aria-hidden="true">↗</span>
        </button>)}
      </div>
    </aside>
  </div>;
}

function errorBounds(value: number, uncertainty?: Uncertainty): [number, number] {
  if (uncertainty === undefined) return [value, value];
  if (typeof uncertainty === 'number') return [value - uncertainty, value + uncertainty];
  return [value - uncertainty.minus, value + uncertainty.plus];
}

export function ForestPlot({ estimate }: { estimate: WeightedH0Estimate }) {
  const values = useMemo(() => estimate.measurements.flatMap(item => [item.value, ...errorBounds(item.value, item.uncertainty)]).concat([estimate.value, ...errorBounds(estimate.value, estimate.interval2Sigma ? { plus: estimate.interval2Sigma[1] - estimate.value, minus: estimate.value - estimate.interval2Sigma[0] } : estimate.uncertainty)]), [estimate]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, Number.EPSILON);
  const x = (value: number) => `${Math.max(0, Math.min(100, ((value - min) / span) * 100))}%`;
  return <div className="forest-plot" role="img" aria-label={`Distribuição de ${estimate.measurements.length} medições e estimativa ponderada ${formatEstimate(estimate.value, estimate.uncertainty)}`}>
    <div className="forest-axis"><span>{formatNumber(min, 2)}</span><span>{formatNumber((min + max) / 2, 2)}</span><span>{formatNumber(max, 2)}</span></div>
    <div className="forest-track"><i className="forest-band band-2" style={{ left: x(estimate.interval2Sigma?.[0] ?? min), width: `${estimate.interval2Sigma ? Math.max(0, ((estimate.interval2Sigma[1] - estimate.interval2Sigma[0]) / span) * 100) : 100}%` }}/><i className="forest-band band-1" style={{ left: x(estimate.interval1Sigma?.[0] ?? (estimate.uncertainty ? errorBounds(estimate.value, estimate.uncertainty)[0] : min)), width: `${estimate.interval1Sigma ? Math.max(0, ((estimate.interval1Sigma[1] - estimate.interval1Sigma[0]) / span) * 100) : estimate.uncertainty ? Math.max(0, ((errorBounds(estimate.value, estimate.uncertainty)[1] - errorBounds(estimate.value, estimate.uncertainty)[0]) / span) * 100) : 0}%` }}/><i className="forest-estimate" style={{ left: x(estimate.value) }} /></div>
    <div className="forest-rows">{estimate.measurements.map(item => <MeasurementRow key={item.id} item={item} min={min} span={span}/>)}</div>
    <div className="forest-legend"><span><i className="legend-dot weighted"/>Estimativa ponderada</span><span><i className="legend-swatch sigma-1"/>1σ</span><span><i className="legend-swatch sigma-2"/>2σ</span></div>
  </div>;
}

function MeasurementRow({ item, min, span }: { item: DatasetMeasurement; min: number; span: number }) {
  const bounds = errorBounds(item.value, item.uncertainty);
  const x = (value: number) => `${Math.max(0, Math.min(100, ((value - min) / span) * 100))}%`;
  return <div className="measurement-row" title={[item.dataset, formatEstimate(item.value, item.uncertainty), item.method, item.reference].filter(Boolean).join(' · ')}><span className="measurement-label">{item.dataset}</span><span className="measurement-track"><i style={{ left: x(bounds[0]), width: `${Math.max(1, ((bounds[1] - bounds[0]) / span) * 100)}%` }}/><b style={{ left: x(item.value) }}/></span><span className="measurement-value">{formatEstimate(item.value, item.uncertainty, 2)}</span></div>;
}

export function TensionComparison({ result }: { result: TensionResult }) {
  const values = result.groups.map(group => group.estimate).filter((value): value is number => value !== undefined);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = Math.max(max - min, Number.EPSILON);
  return <div className="tension-comparison"><div className="comparison-axis"><span>{formatNumber(min, 2)}</span><span>{formatNumber(max, 2)}</span></div>{result.groups.map(group => <div className="comparison-row" key={group.id}><div><b>{group.label}</b><small>{group.category || 'Classificação publicada pela API'}</small></div><div className="comparison-track">{group.estimate !== undefined && <i style={{ left: `${((group.estimate - min) / span) * 100}%` }}/>}</div><strong>{formatEstimate(group.estimate, group.uncertainty)}</strong></div>)}<div className="comparison-summary">{result.difference !== undefined && <span>Δ {formatNumber(result.difference, 2)}</span>}{result.significance !== undefined && <span>significância {formatNumber(result.significance, 2)} σ</span>}{result.compatibility && <span>{result.compatibility}</span>}</div></div>;
}

export function SkyMap({ signal }: { signal: DirectionalSignal }) {
  const point = signal.ra !== undefined && signal.dec !== undefined ? { left: `${(signal.ra / 360) * 100}%`, top: `${((90 - signal.dec) / 180) * 100}%` } : undefined;
  return <div className="sky-map-wrap"><div className="sky-map" role="img" aria-label={point ? `Projeção celeste com direção RA ${formatNumber(signal.ra, 1)}, Dec ${formatNumber(signal.dec, 1)}` : 'Projeção celeste sem coordenadas publicadas'}>{point && <i className="sky-signal" style={point}/>}<span className="sky-lat sky-lat-top">+90°</span><span className="sky-lat sky-lat-mid">0°</span><span className="sky-lat sky-lat-bottom">−90°</span></div><div className="sky-scale"><span>menor amplitude</span><i/><span>maior amplitude</span></div></div>;
}

export function ParameterCard({ parameter, onProvenance, onOpen }: { parameter: ParameterEstimate; onProvenance?: () => void; onOpen?: () => void }) {
  return <div className="parameter-card"><button className="parameter-open" onClick={onOpen} aria-label={`Abrir parâmetro ${parameter.label}`}><span className="parameter-meta">{parameter.label}<ScientificStatusBadge status={parameter.status}/></span><strong>{formatEstimate(parameter.value, parameter.uncertainty)} <small>{parameter.unit || ''}</small></strong></button><span className="parameter-footer">{parameter.evidenceLevel && <em>{parameter.evidenceLevel}</em>}<span>{parameter.updatedAt ? formatDate(parameter.updatedAt) : 'Atualização não publicada'}</span>{onProvenance && <button className="source-link" onClick={onProvenance}>ⓘ Fonte</button>}</span></div>;
}

export function RecordList({ records, empty, onOpen }: { records: ResearchRecord[]; empty: string; onOpen?: (record: ResearchRecord) => void }) {
  if (!records.length) return <div className="panel-empty compact-empty"><p>{empty}</p></div>;
  return <div className="record-list">{records.slice(0, 8).map(record => <button className="record-row" key={record.id} onClick={() => onOpen?.(record)}><span className="record-type">{record.type}</span><span className="record-main"><b>{record.label}</b><small>{record.summary || 'Resumo não publicado.'}</small></span><span className="record-status">{record.status || 'UNKNOWN'} <span aria-hidden="true">↗</span></span></button>)}</div>;
}

export function ReadOnlyNotice() {
  return <div className="read-only-notice"><span aria-hidden="true">◌</span><span>Projeção somente leitura. Ações de escrita aparecem apenas quando houver contrato de escrita publicado pela API.</span></div>;
}

export function formatDataState(state: PanelState): string {
  return state === 'READY' ? 'Dados prontos' : state === 'PARTIAL' ? 'Dados parciais' : state === 'STALE' ? 'Último valor válido' : state;
}
