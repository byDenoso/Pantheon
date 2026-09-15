import type { WorkspacePreferences, WorkspaceStartArea } from '../state/workspace-preferences';

type Props = {
  open: boolean;
  preferences: WorkspacePreferences;
  onChange: (patch: Partial<WorkspacePreferences>) => void;
  onReset: () => void;
  onClose: () => void;
};

const START_AREAS: Array<[WorkspaceStartArea, string]> = [
  ['graphs', 'Grafos'],
  ['observatory', 'Observatório'],
  ['cockpit', 'Cockpit']
];

export function WorkspacePreferencesDrawer({ open, preferences, onChange, onReset, onClose }: Props) {
  if (!open) return null;
  return <aside className="workspace-preferences-drawer" aria-label="Preferências do workspace" role="dialog">
    <div className="workspace-preferences-heading">
      <div><span className="eyebrow">WORKSPACE</span><h2>Personalizar o Atlas</h2></div>
      <button className="icon-button" onClick={onClose} aria-label="Fechar preferências">×</button>
    </div>
    <p className="workspace-preferences-intro">Escolha o ponto de entrada e as superfícies que aparecem no seu mapa. A configuração fica somente neste navegador.</p>
    <label className="workspace-preferences-field"><span>Superfície inicial</span><select value={preferences.startArea} onChange={event => onChange({ startArea: event.target.value as WorkspaceStartArea })}>{START_AREAS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <fieldset className="workspace-preferences-options"><legend>Camadas do workspace</legend>
      <label><input type="checkbox" checked={preferences.showResearch} onChange={event => onChange({ showResearch: event.target.checked })}/><span><b>Pesquisa</b><small>Observatório e resumo do universo</small></span></label>
      <label><input type="checkbox" checked={preferences.showOperations} onChange={event => onChange({ showOperations: event.target.checked })}/><span><b>Operação</b><small>Cockpit e estado operacional</small></span></label>
      <label><input type="checkbox" checked={preferences.showLearning} onChange={event => onChange({ showLearning: event.target.checked })}/><span><b>Aprendizado</b><small>Camada transversal do grafo</small></span></label>
    </fieldset>
    <div className="workspace-preferences-footer"><span>Aplicação imediata</span><button className="secondary-button" onClick={onReset}>Restaurar padrão</button></div>
  </aside>;
}
