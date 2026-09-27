import type { TruthGraphFinding, WorldState } from '../contracts/world';
import { dateTime } from '../app/model';
import { domainLabel, humanizeText, label } from '../viewmodels/tokens.ts';

const STATUS_CLASS: Record<string, string> = {
  LIVE: 'available', DEGRADED: '', CONFLICT: '', STALE_DECLARATION: '', MISSING_PROVIDER: '', BLOCKED: '',
};
const STATUS_COPY: Record<string, string> = {
  LIVE: 'Fonte em dia', DEGRADED: 'Leitura com limitações', CONFLICT: 'Fontes em conflito',
  STALE_DECLARATION: 'Declaração antiga', MISSING_PROVIDER: 'Fonte não encontrada', BLOCKED: 'Leitura bloqueada',
};

function Finding({ finding }: { finding: TruthGraphFinding }) {
  const authority = typeof finding.authority === 'string' ? finding.authority : finding.authority.canonical_truth;
  return <div className="provider-line truthgraph-finding" data-status={finding.status}>
    <div>
      <strong>{domainLabel(finding.domain)} · {STATUS_COPY[finding.status] ?? 'Situação ainda não descrita'}</strong>
      <span>{humanizeText(finding.explanation)}</span>
      <small>Fonte responsável: {label(authority)}</small>
      <small>Fonte observada: {humanizeText(finding.provider.actual) || 'nenhuma'} · {label(finding.provider.status)}. Fonte esperada: {humanizeText(finding.provider.expected) || 'nenhuma'} · {label(finding.provider.expected_status)}.</small>
      <small>O que essa fonte consegue fazer: {humanizeText(finding.capability.summary)}</small>
      <details><summary>Detalhes técnicos da verificação</summary><small className="mono">{finding.fingerprint} · conferido {dateTime(finding.checked_at)}</small></details>
    </div>
    <a className={`provider-pill ${STATUS_CLASS[finding.status] || ''}`} href={finding.source_ref} target="_blank" rel="noopener noreferrer">Abrir fonte ↗</a>
  </div>;
}

export function TruthGraphRadar({ world, domain }: { world: WorldState | null; domain: string }) {
  const graph = world?.truthGraph;
  if (!graph) return null;
  const results = domain === 'NEXO' ? graph.results : graph.results.filter(result => result.domain === domain);
  if (!results.length) return null;
  const conflicts = results.filter(result => result.status === 'CONFLICT').length;
  const material = results.filter(result => result.material).length;
  return <section aria-label="Conferência de fontes e recursos">
    <div className="section-head secondary"><h2>Conferência de fontes <span>{material || '0'}</span></h2><span className="eyebrow">QUEM FORNECE CADA DADO</span></div>
    <div className="notice-box">
      <strong>{conflicts ? `${conflicts} conflito${conflicts > 1 ? 's' : ''} entre fontes` : 'Fontes conferidas'}</strong><br />
      Esta leitura compara a fonte responsável com a fonte que respondeu. Conflitos que afetam decisões também aparecem em Integridade.
      <details><summary>Detalhes da leitura</summary><span className="mono">{graph.fingerprint}</span> · conferido em {dateTime(graph.checked_at)}</details>
    </div>
    <div className="provider-list">{results.map(result => <Finding key={`${result.domain}:${result.fingerprint}`} finding={result} />)}</div>
    <a className="atlas-launch" href="https://nexo-atlas-control-tower.vercel.app" target="_blank" rel="noopener noreferrer">
      <span><span className="eyebrow">ATLAS</span><strong>Ver fontes e recursos</strong><small>Continuar a conferência no observatório</small></span>
      <span className="atlas-orbit" aria-hidden="true">✧</span><span>↗</span>
    </a>
  </section>;
}
