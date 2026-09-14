import { useEffect, useState } from 'react';
import type { AtlasApiClient } from '../api/types';
import { resolveHealthPlanes, planeLabel } from '../core/cockpit-view-model';
import { resolveLearnerLayer } from '../graph-engine/learner-overlay';
import { PublicSnapshotSource } from '../core/PublicSnapshotSource';
import { summarizeCampaignStatus, type CockpitCampaignRow } from '../core/cockpit-campaigns';
import { routeFor } from '../atlas-route';
import type { HealthPlane } from '../core/contracts';

const STATUS_LABEL: Record<HealthPlane['status'], string> = { GREEN: 'OK', AMBER: 'ATENÇÃO', RED: 'CRÍTICO', UNKNOWN: 'DESCONHECIDO' };

type PublicOperation = { id: string; label: string; status: string; updatedAt?: string };
type PublicAuditIssue = { id: string; type: string; status: string; severity: string; scope: string };

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function parseOperations(value: unknown): { actions: PublicOperation[]; runs: PublicOperation[] } {
  const root = record(value);
  const parse = (items: unknown): PublicOperation[] => records(items)
    .map(item => ({ id: text(item.id), label: text(item.label, text(item.name, 'Operação publicada')), status: text(item.status, 'UNKNOWN'), updatedAt: text(item.updatedAt) || undefined }))
    .filter(item => item.id);
  return { actions: parse(root.actions), runs: parse(root.runs) };
}

function mergeUniqueOperations(items: PublicOperation[]): PublicOperation[] {
  return Array.from(new Map(items.map(item => [item.id, item])).values());
}

function parseAudit(value: unknown): PublicAuditIssue[] {
  return records(record(value).issues).map(item => ({
    id: text(item.id),
    type: text(item.type, 'verificação'),
    status: text(item.status, 'UNKNOWN'),
    severity: text(item.severity, 'UNKNOWN'),
    scope: text(item.scope, 'NEXO')
  })).filter(item => item.id);
}

function humanAuditType(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

// Cockpit is the operational home: backend/API health, sync, campaign status and
// access links. It intentionally never mounts GraphRenderer/AtlasCanvas or repeats
// the full graph exploration surface -- that is Grafos's job (src/pages/graphs-page.tsx).
export function CockpitPage({ api, navigate }: { api: AtlasApiClient; navigate: (href: string) => void }) {
  const [planes, setPlanes] = useState<HealthPlane[] | null>(null);
  const [fingerprint, setFingerprint] = useState<string | undefined>();
  const [sourceVersion, setSourceVersion] = useState<string | undefined>();
  const [freshness, setFreshness] = useState('UNKNOWN');
  const [source, setSource] = useState('Fonte não identificada');
  const [learnerUnavailable, setLearnerUnavailable] = useState(false);
  const [campaigns, setCampaigns] = useState<CockpitCampaignRow[] | null>(null);
  const [campaignsUnavailable, setCampaignsUnavailable] = useState(false);
  const [operations, setOperations] = useState<{ actions: PublicOperation[]; runs: PublicOperation[] } | null>(null);
  const [audit, setAudit] = useState<PublicAuditIssue[] | null>(null);

  useEffect(() => {
    let live = true;
    void api.health().then((health: unknown) => {
      if (!live) return;
      const typed = health as { fingerprint?: string; sourceVersion?: string; contract?: string; dataSource?: { freshness?: string; reason?: string; source?: string; effective?: string } };
      setPlanes(resolveHealthPlanes(typed));
      setFingerprint(typed.fingerprint);
      setSourceVersion(typed.sourceVersion);
      setFreshness(text(typed.dataSource?.freshness, 'UNKNOWN').toUpperCase());
      setSource(text(typed.dataSource?.effective || typed.dataSource?.source, 'Fonte não identificada'));
    }).catch(() => {
      if (live) setPlanes(resolveHealthPlanes(null));
    });

    // These are public read projections. They expose what the backend published
    // without turning the Cockpit into a write surface or pretending private auth exists.
    void api.ops().then(value => { if (live) setOperations(parseOperations(value)); }).catch(() => { if (live) setOperations({ actions: [], runs: [] }); });
    void api.automationRuns().then(value => {
      if (!live) return;
      const parsed = parseOperations({ runs: value });
      setOperations(previous => ({ actions: previous?.actions || [], runs: mergeUniqueOperations([...(previous?.runs || []), ...parsed.runs]) }));
    }).catch(() => undefined);
    void api.audit().then(value => { if (live) setAudit(parseAudit(value)); }).catch(() => { if (live) setAudit([]); });

    const snapshot = new PublicSnapshotSource(api);
    void snapshot.getLearnerLayer().then(envelope => {
      if (live) setLearnerUnavailable(envelope.state === 'DATA_UNAVAILABLE');
    });
    void snapshot.getDomains().then(async domainsEnvelope => {
      if (!live) return;
      const domains = domainsEnvelope.data || [];
      if (!domains.length) {
        setCampaignsUnavailable(true);
        return;
      }
      const perDomain = await Promise.all(domains.map(domain => snapshot.getDomainCampaigns(domain.id)));
      if (!live) return;
      const allCampaigns = perDomain.flatMap(envelope => envelope.data || []);
      if (!allCampaigns.length) {
        setCampaignsUnavailable(true);
        return;
      }
      setCampaigns(summarizeCampaignStatus(allCampaigns));
    }).catch(() => {
      if (live) setCampaignsUnavailable(true);
    });
    return () => { live = false; };
  }, [api]);

  // With no consumption proof in the public projection, Learner stays a pending
  // reference badge. The Cockpit must never animate an unsupported relationship.
  const learnerReference = resolveLearnerLayer([
    { id: 'reference', sourceNodeId: 'campaign:gz-01-b02', targetNodeId: null, state: 'pending', observedAt: null, sourceRef: null, consumptionProof: null }
  ])[0];
  const blocked = operations?.actions.filter(item => item.status.toUpperCase() === 'BLOCKED') || [];
  const activeRuns = operations?.runs.filter(item => !['DONE', 'COMPLETED', 'FAILED'].includes(item.status.toUpperCase())) || [];
  const visibleAudit = audit?.slice(0, 5) || [];

  return (
    <div className="page-wrap cockpit-page">
      <div className="cockpit-hero">
        <div>
          <span className="eyebrow">NEXO ATLAS / OPERAÇÃO</span>
          <h1>Cockpit</h1>
          <p className="cockpit-subtitle">O estado que o backend publicou, reunido em uma leitura rápida: saúde, sincronização, campanhas, bloqueios e rastreabilidade.</p>
        </div>
        <div className="cockpit-hero-status" aria-label="Estado da fonte">
          <span className={'cockpit-source-dot cockpit-source-dot--' + freshness.toLowerCase()} aria-hidden="true" />
          <b>{freshness === 'LIVE' ? 'Backend ao vivo' : 'Snapshot público'}</b>
          <small>{source}</small>
        </div>
      </div>

      <section className="cockpit-section cockpit-glance" aria-label="Visão rápida">
        <div><strong>{campaigns?.length ?? '—'}</strong><span>campanhas visíveis</span></div>
        <div><strong>{blocked.length || (operations ? '0' : '—')}</strong><span>bloqueios publicados</span></div>
        <div><strong>{activeRuns.length || (operations ? '0' : '—')}</strong><span>execuções em andamento</span></div>
        <div><strong>{visibleAudit.length || (audit ? '0' : '—')}</strong><span>verificações recentes</span></div>
      </section>

      <section className="cockpit-section" aria-label="Saúde por plano">
        <div className="cockpit-section-heading"><div><span className="eyebrow">SINAIS DO SISTEMA</span><h2>Saúde do sistema</h2></div><span className="cockpit-section-note">Cada sinal precisa de uma fonte</span></div>
        <ul className="health-plane-list">
          {(planes || resolveHealthPlanes(null)).map(plane => (
            <li key={plane.id} className={'health-plane health-plane--' + plane.status.toLowerCase()}>
              <b>{planeLabel(plane.id)}</b>
              <span className="health-plane-status">{STATUS_LABEL[plane.status]}</span>
              <small>{plane.reason}</small>
            </li>
          ))}
        </ul>
      </section>

      <div className="cockpit-two-column">
        <section className="cockpit-section" aria-label="Última sincronização">
          <div className="cockpit-section-heading"><div><span className="eyebrow">FONTE</span><h2>Última sincronização</h2></div><span className="cockpit-section-note">{freshness}</span></div>
          {sourceVersion ? <div className="cockpit-sync-summary"><strong>{sourceVersion}</strong><span>{source}</span><details><summary>Identidade técnica</summary><code>{fingerprint || 'Fingerprint não publicado'}</code></details></div> : <p className="cockpit-empty">Ainda não foi possível ler a identidade da fonte.</p>}
        </section>

        <section className="cockpit-section" aria-label="Learner">
          <div className="cockpit-section-heading"><div><span className="eyebrow">CAMADA TRANSVERSAL</span><h2>Learner</h2></div><span className="cockpit-section-note">Filamento extra</span></div>
          {learnerUnavailable ? <p className="cockpit-empty">O backend ainda não publica o estado do scheduler Learner. A camada permanece reservada, sem linha ou partícula inventada.</p> : <p className="cockpit-empty">Referência do audit: <b>{learnerReference.legendText}</b>{learnerReference.geometry === 'badge' && ' — badge no nó de origem.'}</p>}
        </section>
      </div>

      <section className="cockpit-section" aria-label="Status das campanhas">
        <div className="cockpit-section-heading"><div><span className="eyebrow">CIÊNCIA / PROJEÇÃO ESTRUTURAL</span><h2>Campanhas</h2></div><a className="source-link" href={routeFor('graphs')} onClick={event => { event.preventDefault(); navigate(routeFor('graphs')); }}>Explorar todas →</a></div>
        {campaigns?.length ? <ul className="cockpit-campaign-list">{campaigns.map(campaign => <li key={campaign.id} className="cockpit-campaign-row"><span className="cockpit-campaign-label">{campaign.label}</span><span className="cockpit-campaign-status">{campaign.status}</span><a className="source-link" href={campaign.domain ? routeFor('graphs', { domain: campaign.domain }) : routeFor('graphs')} onClick={event => { event.preventDefault(); navigate(campaign.domain ? routeFor('graphs', { domain: campaign.domain }) : routeFor('graphs')); }}>Abrir em Grafos →</a></li>)}</ul> : campaignsUnavailable ? <p className="cockpit-empty">Nenhuma campanha foi publicada nesta fonte.</p> : <p className="cockpit-empty">Lendo as campanhas publicadas…</p>}
      </section>

      <section className="cockpit-section" aria-label="Operação pública">
        <div className="cockpit-section-heading"><div><span className="eyebrow">BACKEND / RASTREABILIDADE</span><h2>Operação publicada</h2></div><span className="cockpit-section-note">Somente leitura</span></div>
        <div className="cockpit-operational-grid">
          <article><h3>Bloqueios</h3>{operations === null ? <p className="cockpit-empty">Lendo…</p> : blocked.length ? <ul className="cockpit-operation-list">{blocked.map(item => <li key={item.id}><b>{item.label}</b><span>{item.status}</span><small>{item.updatedAt || 'Data não publicada'}</small></li>)}</ul> : <p className="cockpit-empty">Nenhum bloqueio publicado.</p>}</article>
          <article><h3>Trabalho ativo</h3>{operations === null ? <p className="cockpit-empty">Lendo…</p> : activeRuns.length ? <ul className="cockpit-operation-list">{activeRuns.map(item => <li key={item.id}><b>{item.label}</b><span>{item.status}</span><small>{item.updatedAt || 'Data não publicada'}</small></li>)}</ul> : <p className="cockpit-empty">Nenhuma execução ativa publicada.</p>}</article>
          <article><h3>Verificações recentes</h3>{audit === null ? <p className="cockpit-empty">Lendo…</p> : visibleAudit.length ? <ul className="cockpit-operation-list">{visibleAudit.map(item => <li key={item.id}><b>{humanAuditType(item.type)}</b><span>{item.status}</span><small>{item.scope} · severidade {item.severity}</small></li>)}</ul> : <p className="cockpit-empty">Nenhuma verificação publicada.</p>}</article>
        </div>
      </section>

      <section className="cockpit-section" aria-label="Links de acesso">
        <div className="cockpit-section-heading"><div><span className="eyebrow">ATALHOS</span><h2>Continuar investigação</h2></div><span className="cockpit-section-note">Links diretos</span></div>
        <ul className="cockpit-access-links"><li><a className="secondary-button" href={routeFor('graphs')} onClick={event => { event.preventDefault(); navigate(routeFor('graphs')); }}>Abrir Grafos →</a></li><li><a className="secondary-button" href={routeFor('observatory')} onClick={event => { event.preventDefault(); navigate(routeFor('observatory')); }}>Abrir Observatório →</a></li><li><a className="secondary-button" href={routeFor('universe')} onClick={event => { event.preventDefault(); navigate(routeFor('universe')); }}>Abrir Resumo do Universo →</a></li></ul>
      </section>
    </div>
  );
}
