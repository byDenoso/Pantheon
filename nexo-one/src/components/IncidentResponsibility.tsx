import type { EvolutionIncidentSummary } from '../contracts/system.ts';
import { incidentView } from '../viewmodels/incidents.ts';

/** Render only named public projection fields; never raw handoff/details payloads. */
export function IncidentResponsibility({ incident }: { incident: EvolutionIncidentSummary }) {
  const view = incidentView(incident);
  const accepted = view.items.filter(item => item.acceptance === 'Aceite registrado' && item.currentOwner !== 'não informado');
  const assigned = view.items.filter(item => item.acceptance === 'Encaminhado · aceite ainda não registrado');
  return <div className="incident-responsibility">
    <p className="incident-owner">{accepted.length
      ? `Responsável com aceite registrado: ${[...new Set(accepted.map(item => item.currentOwner))].join(', ')}`
      : assigned.length ? 'Encaminhado · aceite ainda não registrado' : 'Responsável com aceite não informado'}</p>
    <details className="incident-ownership"><summary>Responsabilidade e recuperação</summary>
    {view.items.length ? view.items.map(item => <div key={item.workId}>
      <p><code style={{ overflowWrap: 'anywhere' }}>{item.workId}</code> · responsável atual: {item.currentOwner} · destinatário: {item.assignedTo}</p>
      <p>{item.acceptance} · validação: {item.validation}</p>
    </div>) : <p>Responsável operacional não informado</p>}
    {view.suggestedOwner && <p>Papel sugerido: {view.suggestedOwner} · sugestão, sem atribuição</p>}
    {view.reason && <p>Causa registrada: {view.reason}</p>}
    {view.nextAction && <p>Próxima ação: {view.nextAction}</p>}
    {view.resolutionScope && <p>{view.resolutionScope}</p>}
    <p>Aprendizagem: {view.learning} · próxima etapa: {view.learningOwner}</p>
    <p className="hud-muted">O estado operacional não altera o resultado científico.</p>
    </details>
  </div>;
}
