import type { SystemState } from '../../contracts/system.ts';
import type { Lab, TestEntity } from './model.ts';
import { labHref } from './routes.ts';

/** Only canonical graph relations and published metadata; no guessed ownership. */
export function DependencyFlow({ test, lab, state }: { test: TestEntity; lab: Lab; state: SystemState }) {
  const node = state.graph.nodes.find(n => n.type === 'TEST' && n.id.replace(/^test:/, '') === test.id);
  const refs = node ? state.graph.edges.flatMap(edge => edge.kind === 'DEPENDS_ON' && edge.from === node.id ? [edge.to] : edge.kind === 'BLOCKS' && edge.to === node.id ? [edge.from] : []) : [];
  const dependencies = [...new Set(refs)].map(id => state.graph.nodes.find(n => n.id === id)).filter(n => !!n);
  const relatedNotes = (state.evolution?.board ?? []).filter(p => p.refs?.includes(test.id) && !p.resolved_at && (!p.expires_at || Date.parse(p.expires_at) > Date.now()));
  if (test.verdict !== 'BLOCKED' && !dependencies.length) return null;
  return <section className="hud-section dependency-flow" aria-labelledby="dependency-flow-title">
    <h2 id="dependency-flow-title">O que precisa destravar</h2>
    <p className="hud-big">{test.blocker ?? 'Motivo do bloqueio não publicado.'}</p>
    <p className="hud-note">Responsável pelo teste: {node?.owner_role ?? 'não publicado'}</p>
    {dependencies.length ? <ol className="hud-list">{dependencies.map(dep => {
      const id = dep.id.replace(/^(test|action):/, '');
      const action = state.actions?.find(a => a.action_id === id);
      return <li key={dep.id}><div>{lab.tests.has(id) ? <a href={labHref('entidade', id)}>{dep.label}</a> : <b>{dep.label}</b>}<p className="hud-note">Estado: {dep.operational_status ?? dep.state} · responsável: {dep.owner_role ?? 'não publicado'}</p><p className="hud-note">Próxima ação: {action?.next_action ?? 'não publicada'}</p></div></li>;
    })}</ol> : <p className="hud-note">Dependência estruturada não publicada no grafo recebido.</p>}
    {relatedNotes.length > 0 && <details><summary>Pedidos relacionados no mural ({relatedNotes.length})</summary>{relatedNotes.slice(0, 3).map(p => <p key={p.id}>{p.from} → {p.to}: {p.text}</p>)}</details>}
    <p className="hud-note">Fonte: relações DEPENDS_ON / BLOCKS do grafo público e ações publicadas.</p>
  </section>;
}
