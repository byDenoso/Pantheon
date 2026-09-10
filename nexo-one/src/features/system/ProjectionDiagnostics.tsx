import type { SystemState } from '../../contracts/system.ts';
import { CapabilityBadge, FreshnessIndicator, StatusBadge } from '../../components/primitives.tsx';

export function ProjectionDiagnostics({ state }: { state: SystemState }) {
  if (state.bus.state === 'LIVE') return null;
  const sources = state.bus.sources.filter(source => source.state !== 'LIVE');
  const providers = state.providers.filter(provider => provider.state !== 'LIVE');
  const capabilities = state.capabilities.filter(capability => capability.status !== 'PASS');
  const envelopes = state.envelopes.filter(envelope => envelope.state !== 'LIVE');
  return (
    <div className="readback-panel" role="status" aria-label="Diagnóstico do Projection Bus">
      <div className="section-head secondary">
        <h2>Por que o Projection Bus está {state.bus.state}</h2>
        <StatusBadge state={state.bus.state} />
      </div>
      <dl className="meta-row">
        <div><dt>fontes fora de LIVE</dt><dd>{sources.length}</dd></div>
        <div><dt>providers fora de LIVE</dt><dd>{providers.length}</dd></div>
        <div><dt>capabilities sem PASS</dt><dd>{capabilities.length}</dd></div>
        <div><dt>envelopes fora de LIVE</dt><dd>{envelopes.length}</dd></div>
      </dl>
      {sources.length > 0 && <div><strong>Fontes</strong><ul className="blocker-list">{sources.map(source => (
        <li key={source.id}><code>{source.id}</code> <StatusBadge state={source.state} compact /> <FreshnessIndicator freshness={source.freshness} showTime={false} /></li>
      ))}</ul></div>}
      {providers.length > 0 && <div><strong>Providers</strong><ul className="blocker-list">{providers.map(provider => (
        <li key={provider.id}><code>{provider.id}</code> <StatusBadge state={provider.state} compact /> {provider.explanation}</li>
      ))}</ul></div>}
      {capabilities.length > 0 && <div><strong>Capabilities</strong><ul className="blocker-list">{capabilities.slice(0, 12).map(capability => (
        <li key={capability.capability_id}><CapabilityBadge status={capability.status} id={capability.capability_id} /> {capability.explanation}</li>
      ))}</ul></div>}
      {envelopes.length > 0 && <div><strong>Envelopes</strong><ul className="blocker-list">{envelopes.slice(0, 12).map(envelope => (
        <li key={envelope.entity_id}><code>{envelope.entity_id}</code> <StatusBadge state={envelope.state} compact /> · {envelope.source_ref}</li>
      ))}</ul></div>}
    </div>
  );
}
