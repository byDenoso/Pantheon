// Inspector de entidade do Atlas. Mesmo conteúdo no desktop (painel lateral)
// e no mobile (folha inferior); só o invólucro muda.
import type { GraphNode } from '../contracts/system.ts';
import type { Relation } from '../viewmodels/graph.ts';
import { provenanceOf } from '../viewmodels/system.ts';
import { dateTime, label, toneOf } from '../viewmodels/tokens.ts';
import {
  AuthorityBadge, DomainBadge, Fingerprint, FreshnessIndicator, SeverityBadge, SourceRef, StatusBadge,
} from './primitives.tsx';
import { ProvenanceBody } from './provenance.tsx';

function RelationList(
  { title, relations, onSelect }:
  { title: string; relations: Relation[]; onSelect: (id: string) => void },
) {
  return (
    <section className="relation-block">
      <span className="eyebrow">{title} <b>{relations.length}</b></span>
      {relations.length === 0 && <p className="quiet-note">Nenhuma relação nesta direção dentro do filtro atual.</p>}
      <ul className="relation-list">
        {relations.map(relation => (
          <li key={relation.edge.id}>
            <button onClick={() => onSelect(relation.node.id)} title={relation.edge.explanation}>
              <span className={`relation-kind tone-${relation.edge.kind === 'CONTRADICTS' || relation.edge.kind === 'BLOCKS' ? 'conflict' : 'snapshot'}`}>
                {label(relation.edge.kind)}
              </span>
              <span className="relation-label">{relation.node.label}</span>
              <span className="relation-meta">
                <StatusBadge state={relation.node.state} compact />
                {relation.edge.weight < 1 && <em>peso {relation.edge.weight.toFixed(2)}</em>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EntityInspector(
  { node, upstream, downstream, onSelect, onClose }:
  {
    node: GraphNode;
    upstream: Relation[];
    downstream: Relation[];
    onSelect: (id: string) => void;
    onClose?: () => void;
  },
) {
  return (
    <div className={`entity-inspector tone-${toneOf(node.state)}`}>
      <header className="inspector-head">
        <div>
          <span className="eyebrow">{label(node.type)}</span>
          <h2>{node.label}</h2>
        </div>
        {onClose && <button className="icon-btn" onClick={onClose} aria-label="Fechar inspector">×</button>}
      </header>
      <div className="inspector-badges">
        <DomainBadge domain={node.domain} />
        <StatusBadge state={node.state} />
        <AuthorityBadge authority={node.authority_class} />
        {node.severity && <SeverityBadge severity={node.severity} />}
        {node.runtime && <span className="runtime-chip">{label(node.runtime)}</span>}
      </div>
      <p className="inspector-summary">{node.summary}</p>

      <section className="inspector-block">
        <span className="eyebrow">ESTADO E LEITURA</span>
        <dl className="meta-row">
          <div><dt>Freshness</dt><dd><FreshnessIndicator freshness={node.freshness} /></dd></div>
          <div><dt>checked_at</dt><dd>{dateTime(node.checked_at)}</dd></div>
          <div><dt>fingerprint</dt><dd><Fingerprint value={node.fingerprint} /></dd></div>
          <div><dt>source_revision</dt><dd><code className="fingerprint-chip">{node.source_revision}</code></dd></div>
        </dl>
        <SourceRef value={node.source_ref} />
      </section>

      <RelationList title="UPSTREAM" relations={upstream} onSelect={onSelect} />
      <RelationList title="DOWNSTREAM" relations={downstream} onSelect={onSelect} />

      <section className="inspector-block">
        <span className="eyebrow">EVIDÊNCIA / READBACK</span>
        {node.evidence?.length
          ? <ul className="evidence-list">{node.evidence.map(ref => <li key={ref}><SourceRef value={ref} /></li>)}</ul>
          : <p className="quiet-note">Nenhuma evidência de execução registrada para esta entidade. Ausência de prova não é prova de ausência.</p>}
      </section>

      <details className="inspector-provenance">
        <summary>Proveniência completa</summary>
        <ProvenanceBody provenance={provenanceOf({
          source_ref: node.source_ref, source_revision: node.source_revision, fingerprint: node.fingerprint,
          authority_class: node.authority_class, checked_at: node.checked_at, freshness: node.freshness,
          derivation_rule: `graph_contract_v1(type=${node.type})`, projection_role: 'ATLAS',
        })} />
      </details>
    </div>
  );
}
