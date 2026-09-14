import { useEffect, useState } from 'react';
import type { AtlasApiClient } from '../api/types';
import { resolveHealthPlanes, planeLabel } from '../core/cockpit-view-model';
import { activeOperations, freshnessLabel, loadCockpitSources, mergeRunSources, readMetadata, type CockpitSources, type SourceRead } from '../core/cockpit-sources';
import { PublicSnapshotSource } from '../core/PublicSnapshotSource';
import { summarizeCampaignStatus, type CockpitCampaignRow } from '../core/cockpit-campaigns';
import { routeFor } from '../atlas-route';
import type { HealthPlane } from '../core/contracts';

const STATUS_LABEL: Record<HealthPlane['status'], string> = { GREEN: 'OK', AMBER: 'ATENÇÃO', RED: 'CRÍTICO', UNKNOWN: 'DESCONHECIDO' };
const readLabel = (read?: SourceRead<unknown>) => !read ? 'Lendo…' : read.state === 'ERROR' ? 'Fonte indisponível' : read.state === 'PARTIAL' ? 'Leitura parcial / desatualizada' : 'Leitura recebida';
const countLabel = (count: number, read?: SourceRead<unknown>) => !read || read.state === 'ERROR' ? '—' : read.state === 'PARTIAL' ? count ? `≥ ${count}` : '—' : count;

function humanAuditType(value: string): string { return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()); }

// Cockpit answers one question: is the system moving? It never mounts the spatial
// renderer and never invents a Pulse/cycle identity when the source does not publish one.
export function CockpitPage({ api, navigate }: { api: AtlasApiClient; navigate: (href: string) => void }) {
  const [sources, setSources] = useState<CockpitSources | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [learnerUnavailable, setLearnerUnavailable] = useState<boolean | null>(null);
  const [campaigns, setCampaigns] = useState<CockpitCampaignRow[] | null>(null);
  const [campaignsUnavailable, setCampaignsUnavailable] = useState(false);
  const [campaignCount, setCampaignCount] = useState<number | null>(null);
  const metadata = readMetadata(sources?.health.data);
  const { fingerprint, sourceVersion, freshness, source } = metadata;
  const planes = resolveHealthPlanes(sources?.health.data || null);

  useEffect(() => {
    let live = true;
    setSources(null); setCampaigns(null); setCampaignCount(null); setCampaignsUnavailable(false); setLearnerUnavailable(null);
    void loadCockpitSources(api).then(value => { if (live) setSources(value); });
    const snapshot = new PublicSnapshotSource(api);
    void snapshot.getLearnerLayer().then(envelope => { if (live) setLearnerUnavailable(envelope.state === 'DATA_UNAVAILABLE'); });
    void snapshot.getDomains().then(async domainsEnvelope => {
      if (!live) return;
      const domains = domainsEnvelope.data || [];
      if (!domains.length) { setCampaignsUnavailable(true); return; }
      const perDomain = await Promise.all(domains.map(domain => snapshot.getDomainCampaigns(domain.id)));
      if (!live) return;
      const allCampaigns = perDomain.flatMap(envelope => envelope.data || []);
      if (!allCampaigns.length) { setCampaignsUnavailable(true); return; }
      setCampaignCount(allCampaigns.length);
      setCampaigns(summarizeCampaignStatus(allCampaigns));
    }).catch(() => { if (live) setCampaignsUnavailable(true); });
    return () => { live = false; };
  }, [api, reloadKey]);

  const runRead = sources ? mergeRunSources(sources) : undefined;
  const blocked = sources?.ops.data?.actions.filter(item => item.status.toUpperCase() === 'BLOCKED') || [];
  const activeRuns = activeOperations(runRead?.data || []);
  const visibleAudit = sources?.audit.data?.slice(0, 5) || [];

  return <div className="page-wrap cockpit-page">
    <div className="cockpit-hero">
      <div><span className="eyebrow">NEXO ATLAS / OPERAÇÃO</span><h1>Cockpit</h1><p className="cockpit-subtitle">Atividade operacional publicada: trabalho ativo, bloqueios, verificações, integridade e proveniência sem inferir o que a fonte não informou.</p></div>
      <div className="cockpit-hero-status" aria-label="Estado da fonte"><span className={'cockpit-source-dot cockpit-source-dot--' + freshness.toLowerCase()} aria-hidden="true"/><b>{freshnessLabel(freshness)}</b><small>{source}</small></div>
    </div>

    <section className="cockpit-section cockpit-glance" aria-label="Visão rápida">
      <div><strong>{campaignCount ?? '—'}</strong><span>campanhas no recorte</span></div>
      <div><strong>{countLabel(activeRuns.length, runRead)}</strong><span>trabalho ativo</span></div>
      <div><strong>{countLabel(blocked.length, sources?.ops)}</strong><span>bloqueios publicados</span></div>
      <div><strong>{countLabel(sources?.audit.data?.length || 0, sources?.audit)}</strong><span>verificações no recorte</span></div>
    </section>

    <section className="cockpit-section" aria-label="Atividade operacional">
      <div className="cockpit-section-heading"><div><span className="eyebrow">AGORA</span><h2>Atividade operacional</h2></div><span className="cockpit-section-note">Sem ciclo/Pulse inferido</span></div>
      <div className="cockpit-operational-grid">
        <article><h3>Trabalho ativo</h3>{activeRuns.length ? <ul className="cockpit-operation-list">{activeRuns.map(item => <li key={item.id}><b>{item.label}</b><span>{item.status}</span><small>{item.updatedAt || 'Data não publicada'}</small></li>)}</ul> : <p className="cockpit-empty">{runRead?.state === 'READY' ? 'Nenhuma execução declarada ativa nesta leitura.' : readLabel(runRead)}</p>}</article>
        <article><h3>Bloqueios</h3>{blocked.length ? <ul className="cockpit-operation-list">{blocked.map(item => <li key={item.id}><b>{item.label}</b><span>{item.status}</span><small>{item.updatedAt || 'Data não publicada'}</small></li>)}</ul> : <p className="cockpit-empty">{sources?.ops.state === 'READY' ? 'Nenhum bloqueio publicado.' : readLabel(sources?.ops)}</p>}</article>
        <article><h3>Verificações recentes</h3>{visibleAudit.length ? <ul className="cockpit-operation-list">{visibleAudit.map(item => <li key={item.id}><b>{humanAuditType(item.type)}</b><span>{item.status}</span><small>{item.scope} · severidade {item.severity}</small></li>)}</ul> : <p className="cockpit-empty">{sources?.audit.state === 'READY' ? 'Nenhuma verificação publicada.' : readLabel(sources?.audit)}</p>}</article>
      </div>
    </section>

    <section className="cockpit-section" aria-label="Saúde por plano">
      <div className="cockpit-section-heading"><div><span className="eyebrow">INTEGRIDADE</span><h2>Saúde do sistema</h2></div><span className="cockpit-section-note">Cada sinal exige fonte própria</span></div>
      <ul className="health-plane-list">{planes.map(plane => <li key={plane.id} className={'health-plane health-plane--' + plane.status.toLowerCase()}><b>{planeLabel(plane.id)}</b><span className="health-plane-status">{STATUS_LABEL[plane.status]}</span><small>{plane.reason}</small></li>)}</ul>
    </section>

    <section className="cockpit-section cockpit-readback" aria-label="Leitura por fonte" aria-busy={!sources}>
      <div className="cockpit-section-heading"><div><span className="eyebrow">READBACK</span><h2>Disponibilidade dos dados</h2></div><button className="secondary-button" disabled={!sources} onClick={() => { api.clear?.(); setReloadKey(value => value + 1); }}>Atualizar leitura</button></div>
      <ul className="cockpit-source-list" aria-live="polite">{(['health', 'ops', 'runs', 'audit'] as const).map((key, index) => <li key={key} data-state={sources?.[key].state || 'LOADING'}><b>{['Saúde', 'Operações', 'Runs', 'Auditoria'][index]}</b><span>{readLabel(sources?.[key])}</span>{sources?.[key].metadata && <small>{freshnessLabel(sources[key].metadata!.freshness)} · {sources[key].metadata!.source}</small>}</li>)}</ul>
      <p className="cockpit-empty">Fonte indisponível permanece desconhecida; ausência de leitura nunca é convertida em zero.</p>
    </section>

    <div className="cockpit-two-column">
      <section className="cockpit-section" aria-label="Proveniência da leitura"><div className="cockpit-section-heading"><div><span className="eyebrow">FONTE</span><h2>Proveniência da leitura</h2></div><span className="cockpit-section-note">{freshness}</span></div><div className="cockpit-sync-summary"><strong>{source}</strong><span>Versão: {sourceVersion || 'não publicada'}</span><span>Atualização informada: {metadata.updatedAt || 'não publicada'}</span><span>Última sincronização: sem recibo nesta leitura.</span><details><summary>Identidade técnica</summary><code>{fingerprint || 'Fingerprint não publicado'}</code></details>{metadata.sourceRef && <a className="source-link" href={metadata.sourceRef} target="_blank" rel="noreferrer">Ver fonte canônica ↗</a>}</div></section>
      <section className="cockpit-section" aria-label="Learner"><div className="cockpit-section-heading"><div><span className="eyebrow">CAMADA TRANSVERSAL</span><h2>Learner</h2></div><span className="cockpit-section-note">Filamentos evidenciados</span></div><p className="cockpit-empty">{learnerUnavailable === null ? 'Lendo relações publicadas…' : learnerUnavailable ? 'Estado do Learner indisponível nesta fonte.' : 'Relações de aprendizado disponíveis no Observatório.'} O estado do scheduler exige um sinal próprio.</p></section>
    </div>

    <section className="cockpit-section" aria-label="Status das campanhas">
      <div className="cockpit-section-heading"><div><span className="eyebrow">CIÊNCIA / PROJEÇÃO ESTRUTURAL</span><h2>Campanhas</h2><span className="cockpit-section-note">{campaigns ? `${campaigns.length} de ${campaignCount} neste recorte` : 'Aguardando leitura'}</span></div><a className="source-link" href={routeFor('observatory')} onClick={event => { event.preventDefault(); navigate(routeFor('observatory')); }}>Explorar no Observatório →</a></div>
      {campaigns?.length ? <ul className="cockpit-campaign-list">{campaigns.map(campaign => <li key={campaign.id} className="cockpit-campaign-row"><span className="cockpit-campaign-label">{campaign.label}</span><span className="cockpit-campaign-status">{campaign.status}</span><a className="source-link" href={campaign.domain ? routeFor('observatory', { domain: campaign.domain }) : routeFor('observatory')} onClick={event => { event.preventDefault(); navigate(campaign.domain ? routeFor('observatory', { domain: campaign.domain }) : routeFor('observatory')); }}>Ver no Observatório →</a></li>)}</ul> : campaignsUnavailable ? <p className="cockpit-empty">Campanhas indisponíveis neste recorte. Tente atualizar a leitura.</p> : <p className="cockpit-empty">Lendo as campanhas publicadas…</p>}
    </section>

    <section className="cockpit-section" aria-label="Links de acesso"><div className="cockpit-section-heading"><div><span className="eyebrow">PRÓXIMO</span><h2>Continuar</h2></div></div><ul className="cockpit-access-links"><li><a className="secondary-button" href={routeFor('observatory')} onClick={event => { event.preventDefault(); navigate(routeFor('observatory')); }}>Abrir Observatório →</a></li><li><a className="secondary-button" href={routeFor('atividade')} onClick={event => { event.preventDefault(); navigate(routeFor('atividade')); }}>Abrir Atividade →</a></li></ul></section>
  </div>;
}