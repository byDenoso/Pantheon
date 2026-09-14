import { useEffect, useState } from 'react';
import type { AtlasApiClient } from '../api/types';
import { resolveHealthPlanes, planeLabel } from '../core/cockpit-view-model';
import { resolveLearnerLayer } from '../graph-engine/learner-overlay';
import { PublicSnapshotSource } from '../core/PublicSnapshotSource';
import { summarizeCampaignStatus, type CockpitCampaignRow } from '../core/cockpit-campaigns';
import { routeFor } from '../atlas-route';
import type { HealthPlane } from '../core/contracts';

const STATUS_LABEL: Record<HealthPlane['status'], string> = { GREEN: 'OK', AMBER: 'ATENÇÃO', RED: 'CRÍTICO', UNKNOWN: 'DESCONHECIDO' };

// Cockpit is the operational home: backend/API health, sync, campaign status and
// access links. It intentionally never mounts GraphRenderer/AtlasCanvas or repeats
// the full graph exploration surface -- that is Grafos's job (src/pages/graphs-page.tsx).
export function CockpitPage({ api, navigate }: { api: AtlasApiClient; navigate: (href: string) => void }) {
  const [planes, setPlanes] = useState<HealthPlane[] | null>(null);
  const [fingerprint, setFingerprint] = useState<string | undefined>();
  const [sourceVersion, setSourceVersion] = useState<string | undefined>();
  const [learnerUnavailable, setLearnerUnavailable] = useState(false);
  const [campaigns, setCampaigns] = useState<CockpitCampaignRow[] | null>(null);
  const [campaignsUnavailable, setCampaignsUnavailable] = useState(false);

  useEffect(() => {
    let live = true;
    void api
      .health()
      .then((health: unknown) => {
        if (!live) return;
        const typed = health as { fingerprint?: string; sourceVersion?: string; contract?: string; dataSource?: { freshness?: string; reason?: string } };
        setPlanes(resolveHealthPlanes(typed));
        setFingerprint(typed.fingerprint);
        setSourceVersion(typed.sourceVersion);
      })
      .catch(() => {
        if (live) setPlanes(resolveHealthPlanes(null));
      });
    const source = new PublicSnapshotSource(api);
    void source.getLearnerLayer().then(envelope => {
      if (live) setLearnerUnavailable(envelope.state === 'DATA_UNAVAILABLE');
    });
    void source.getDomains().then(async domainsEnvelope => {
      if (!live) return;
      const domains = domainsEnvelope.data || [];
      if (!domains.length) {
        setCampaignsUnavailable(true);
        return;
      }
      const perDomain = await Promise.all(domains.map(domain => source.getDomainCampaigns(domain.id)));
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
    return () => {
      live = false;
    };
  }, [api]);

  // Reference snapshot from the audit: with no live evidence, the Learner render
  // instruction must resolve to pending/badge, never active/animated -- proven here by
  // construction (there is no consumptionProof to pass) rather than trusted by claim.
  const learnerReference = resolveLearnerLayer([
    { id: 'reference', sourceNodeId: 'campaign:gz-01-b02', targetNodeId: null, state: 'pending', observedAt: null, sourceRef: null, consumptionProof: null }
  ])[0];

  return (
    <div className="page-wrap cockpit-page">
      <h1>Cockpit</h1>
      <p className="cockpit-subtitle">Saúde operacional do NEXO, não o estado científico. Nada aqui é inventado quando a fonte não prova.</p>

      <section aria-label="Saúde por plano">
        <h2>Saúde do sistema</h2>
        <ul className="health-plane-list">
          {(planes || resolveHealthPlanes(null)).map(plane => (
            <li key={plane.id} className={`health-plane health-plane--${plane.status.toLowerCase()}`}>
              <b>{planeLabel(plane.id)}</b>
              <span className="health-plane-status">{STATUS_LABEL[plane.status]}</span>
              <small>{plane.reason}</small>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Learner">
        <h2>Learner</h2>
        {learnerUnavailable ? (
          <p>DATA_UNAVAILABLE — o snapshot público atual não publica estado do scheduler Learner.</p>
        ) : (
          <p>
            Referência (estado do audit): <b>{learnerReference.legendText}</b>
            {learnerReference.geometry === 'badge' && ' — badge no nó de origem, zero linha, zero partícula.'}
          </p>
        )}
      </section>

      <section aria-label="Último sync">
        <h2>Último sync</h2>
        {fingerprint ? (
          <dl>
            <dt>Fingerprint</dt>
            <dd>{fingerprint}</dd>
            <dt>Source version</dt>
            <dd>{sourceVersion || '—'}</dd>
          </dl>
        ) : (
          <p>DATA_UNAVAILABLE — sem leitura de sync nesta fonte.</p>
        )}
      </section>

      <section aria-label="Status das campanhas">
        <h2>Campanhas</h2>
        {campaigns?.length ? (
          <ul className="cockpit-campaign-list">
            {campaigns.map(campaign => (
              <li key={campaign.id} className="cockpit-campaign-row">
                <span className="cockpit-campaign-label">{campaign.label}</span>
                <span className="cockpit-campaign-status">{campaign.status}</span>
                <a
                  className="source-link"
                  href={campaign.domain ? routeFor('graphs', { domain: campaign.domain }) : routeFor('graphs')}
                  onClick={event => { event.preventDefault(); navigate(campaign.domain ? routeFor('graphs', { domain: campaign.domain }) : routeFor('graphs')); }}
                >
                  Abrir em Grafos →
                </a>
              </li>
            ))}
          </ul>
        ) : campaignsUnavailable ? (
          <p>DATA_UNAVAILABLE — nenhuma campanha publicada nesta fonte.</p>
        ) : (
          <p>Lendo status das campanhas…</p>
        )}
      </section>

      <section aria-label="Blockers e trabalho ativo">
        <h2>Blockers</h2>
        <p>DATA_UNAVAILABLE — requer a fachada privada (não conectada nesta build).</p>
        <h2>Trabalho ativo</h2>
        <p>DATA_UNAVAILABLE — requer a fachada privada (não conectada nesta build).</p>
        <h2>Mudanças recentes</h2>
        <p>DATA_UNAVAILABLE — requer a fachada privada (não conectada nesta build).</p>
      </section>

      <section aria-label="Links de acesso">
        <h2>Links de acesso</h2>
        <ul className="cockpit-access-links">
          <li><a className="secondary-button" href={routeFor('graphs')} onClick={event => { event.preventDefault(); navigate(routeFor('graphs')); }}>Abrir Grafos →</a></li>
          <li><a className="secondary-button" href={routeFor('observatory')} onClick={event => { event.preventDefault(); navigate(routeFor('observatory')); }}>Abrir Observatório →</a></li>
          <li><a className="secondary-button" href={routeFor('universe')} onClick={event => { event.preventDefault(); navigate(routeFor('universe')); }}>Abrir Resumo do Universo →</a></li>
        </ul>
      </section>
    </div>
  );
}
