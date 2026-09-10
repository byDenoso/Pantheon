// TruthGraph, Capability Radar, Sources e Integrity.
import { useState } from 'react';
import type { Capability, SystemState } from '../../contracts/system.ts';
import { CapabilityMatrix, ProjectionHealth, TruthGraphCard } from '../../components/composites.tsx';
import { EmptyState } from '../../components/states.tsx';
import {
  AuthorityBadge, CapabilityBadge, DomainBadge, Fingerprint, FreshnessIndicator,
  SeverityBadge, SourceRef, StatusBadge,
} from '../../components/primitives.tsx';
import { ProvenanceButton } from '../../components/provenance.tsx';
import {
  capabilityById, capabilityCounts, capabilityMatrix, integrityIssues, provenanceOf,
} from '../../viewmodels/system.ts';
import { dateTime, label, toneOf } from '../../viewmodels/tokens.ts';

export function TruthGraphView({ state }: { state: SystemState }) {
  const findings = [...state.findings].sort((a, b) =>
    (a.status === 'CONFLICT' ? -1 : 0) - (b.status === 'CONFLICT' ? -1 : 0));
  const conflicts = findings.filter(f => f.status === 'CONFLICT');
  return (
    <>
      {conflicts.length > 0 && (
        <div className="p0-banner" role="alert">
          <span className="p0-mark" aria-hidden="true">⚠</span>
          <div>
            <strong>{conflicts.length} conflito{conflicts.length > 1 ? 's' : ''} de autoridade em aberto.</strong>
            <span>
              {conflicts.map(c => c.domain).join(', ')} — escritas suspensas e leituras marcadas como não autoritativas
              até que a posse da verdade seja resolvida.
            </span>
          </div>
        </div>
      )}
      <div className="truth-grid-outer">
        {findings.map(finding => (
          <TruthGraphCard key={finding.id} finding={finding} capability={capabilityById(state, finding.capability)} />
        ))}
      </div>
    </>
  );
}

export function CapabilitiesView({ state }: { state: SystemState }) {
  const [selected, setSelected] = useState<Capability | null>(null);
  const { runtimes, cells } = capabilityMatrix(state);
  const counts = capabilityCounts(state);
  return (
    <>
      <div className="capability-counters">
        {(['PASS', 'UNVERIFIED', 'UNKNOWN', 'BLOCKED'] as const).map(status => (
          <div key={status} className={`capability-counter tone-${toneOf(status)}`}>
            <strong>{counts[status]}</strong>
            <CapabilityBadge status={status} />
            <small>{{
              PASS: 'exercidas com evidência',
              UNVERIFIED: 'declaradas, nunca exercidas',
              UNKNOWN: 'sem declaração nem evidência',
              BLOCKED: 'impedidas de serem tentadas',
            }[status]}</small>
          </div>
        ))}
      </div>
      <p className="rule-note">
        <strong>UNVERIFIED não é funcionalidade parcial.</strong> Significa que a operação nunca foi exercida com
        readback. Nenhum indicador desta tela representa esse estado como meio funcionando.
      </p>
      <CapabilityMatrix runtimes={runtimes} cells={cells} onSelect={setSelected} />
      {selected && (
        <section className={`capability-detail tone-${toneOf(selected.status)}`}>
          <div className="section-head">
            <h2>{selected.label}</h2>
            <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Fechar detalhe">×</button>
          </div>
          <div className="inspector-badges">
            <DomainBadge domain={selected.domain} />
            <CapabilityBadge status={selected.status} id={selected.capability_id} />
            <span className="runtime-chip">{label(selected.runtime)}</span>
            <span className="op-chip">{label(selected.operation)}</span>
            <span className={`risk-chip risk-${selected.risk.toLowerCase()}`}>risco {label(selected.risk).toLowerCase()}</span>
          </div>
          <p>{selected.explanation}</p>
          <dl className="meta-row">
            <div><dt>capability_id</dt><dd><code>{selected.capability_id}</code></dd></div>
            <div><dt>provider</dt><dd><code>{selected.provider}</code></dd></div>
            <div><dt>última verificação</dt><dd>{selected.last_verified_at ? dateTime(selected.last_verified_at) : <em>nunca</em>}</dd></div>
            <div><dt>evidência</dt><dd>{selected.evidence_ref ? <SourceRef value={selected.evidence_ref} /> : <em>nenhuma</em>}</dd></div>
          </dl>
        </section>
      )}
    </>
  );
}

export function SourcesView({ state }: { state: SystemState }) {
  return (
    <>
      <ProjectionHealth bus={state.bus} />
      <div className="section-head">
        <h2>Providers</h2>
        <span className="eyebrow">ESPERADO x OBSERVADO</span>
      </div>
      <div className="provider-grid">
        {state.providers.map(provider => (
          <article key={provider.id} className={`provider-card tone-${toneOf(provider.state)}`}>
            <header>
              <strong>{provider.label}</strong>
              <StatusBadge state={provider.state} />
            </header>
            <p>{provider.explanation}</p>
            <dl className="meta-row">
              <div><dt>domínios</dt><dd>{provider.expected_for.map(d => <DomainBadge key={d} domain={d} muted />)}</dd></div>
              <div><dt>última leitura</dt><dd>{provider.last_success_at ? dateTime(provider.last_success_at) : <em>nenhuma</em>}</dd></div>
              <div><dt>verificado em</dt><dd>{dateTime(provider.checked_at)}</dd></div>
            </dl>
            <ul className="provider-capabilities">
              {provider.capabilities.map(id => {
                const capability = capabilityById(state, id);
                return (
                  <li key={id}>
                    <code>{id}</code>
                    {capability && <CapabilityBadge status={capability.status} id={id} />}
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
      <div className="section-head">
        <h2>Envelopes do bus</h2>
        <span className="eyebrow">{state.envelopes.length} PROJEÇÕES</span>
      </div>
      <div className="envelope-table-scroll">
        <table className="envelope-table">
          <thead>
            <tr>
              <th scope="col">entity_id</th><th scope="col">domínio</th><th scope="col">estado</th>
              <th scope="col">authority</th><th scope="col">freshness</th>
              <th scope="col">derivation_rule</th><th scope="col">fingerprint</th><th scope="col">origem</th>
            </tr>
          </thead>
          <tbody>
            {state.envelopes.map(envelope => (
              <tr key={envelope.entity_id} className={`tone-${toneOf(envelope.state)}`}>
                <td><code>{envelope.entity_id}</code></td>
                <td><DomainBadge domain={envelope.domain} muted /></td>
                <td><StatusBadge state={envelope.state} compact /></td>
                <td><AuthorityBadge authority={envelope.authority_class} /></td>
                <td><FreshnessIndicator freshness={envelope.freshness} showTime={false} /></td>
                <td><code className="rule">{envelope.derivation_rule}</code></td>
                <td><Fingerprint value={envelope.fingerprint} /></td>
                <td>
                  <ProvenanceButton title={envelope.title} provenance={provenanceOf({
                    source_ref: envelope.source_ref, source_revision: envelope.source_revision,
                    fingerprint: envelope.fingerprint, authority_class: envelope.authority_class,
                    checked_at: envelope.checked_at, freshness: envelope.freshness,
                    derivation_rule: envelope.derivation_rule, projection_role: envelope.projection_role,
                  })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function IntegrityView({ state }: { state: SystemState }) {
  const issues = integrityIssues(state);
  if (!issues.length) {
    return <EmptyState title="Nenhum achado aberto nesta leitura."
      description="Todos os domínios estão LIVE, todas as capabilities têm evidência e nenhum readback falhou." />;
  }
  return (
    <>
      <p className="rule-note">
        Esta tela lista o que a interface <strong>não</strong> consegue provar. Um item aqui não é um alarme:
        é uma lacuna de evidência declarada explicitamente.
      </p>
      <ul className="integrity-list">
        {issues.map(issue => (
          <li key={issue.id} className={`integrity-row tone-${issue.severity === 'P0' ? 'conflict' : issue.severity === 'P1' ? 'degraded' : 'snapshot'}`}>
            <div className="integrity-head">
              <SeverityBadge severity={issue.severity} />
              <DomainBadge domain={issue.domain} muted />
              <strong>{issue.title}</strong>
            </div>
            <p>{issue.explanation}</p>
            <SourceRef value={issue.source_ref} dim />
          </li>
        ))}
      </ul>
    </>
  );
}
