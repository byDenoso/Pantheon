import type { EvolutionIncidentSummary } from '../contracts/system.ts';
import { incidentView } from '../viewmodels/incidents.ts';

/** Render only named public projection fields; never raw handoff/details payloads. */
export function IncidentResponsibility({ incident }: { incident: EvolutionIncidentSummary }) {
  const view = incidentView(incident);
  return <div className="incident-responsibility">
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
  </div>;
}
