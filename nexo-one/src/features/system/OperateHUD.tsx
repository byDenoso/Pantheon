// Operate mode's four permanent indicators. Compact at macro view; clicking one
// opens an overlay panel (the galaxy stays visible behind it, per spec — this
// never navigates away). Counts come straight from the already-compiled
// GalaxySnapshot: Needs You is exactly state.inbox (Stage 1's strict rule),
// Learn/Capabilities are galaxy entities of that visual kind, Changes comes from the published versioned snapshot diff when available; the
// fallback snapshot remains honest and empty rather than fabricating history.
import type { GalaxySnapshot } from '../../contracts/galaxy.ts';
import type { GalaxyPanelId } from '../../app/galaxyDeepLink.ts';
import { Modal } from '../../shell/Modal.tsx';

const PANEL_LABEL: Record<GalaxyPanelId, string> = {
  'needs-you': 'NEEDS YOU',
  learn: 'LEARN',
  capabilities: 'CAPABILITIES',
  changes: 'CHANGES',
};

const PANEL_ORDER: GalaxyPanelId[] = ['needs-you', 'learn', 'capabilities', 'changes'];

export function OperateHUD(
  { snapshot, openPanel, onOpenPanel, onClosePanel, onFocusEntity }:
  {
    snapshot: GalaxySnapshot;
    openPanel: GalaxyPanelId | null;
    onOpenPanel: (panel: GalaxyPanelId) => void;
    onClosePanel: () => void;
    onFocusEntity: (id: string) => void;
  },
) {
  const hypotheses = snapshot.entities.filter(entity => entity.kind === 'HYPOTHESIS');
  const capabilities = snapshot.entities.filter(entity => entity.kind === 'CAPABILITY');
  const counts: Record<GalaxyPanelId, number> = {
    'needs-you': snapshot.needs_you.length,
    learn: hypotheses.length,
    capabilities: capabilities.length,
    changes: snapshot.changes.length,
  };

  return (
    <>
      <div className="operate-hud" role="group" aria-label="Indicadores operacionais">
        {PANEL_ORDER.map(panel => (
          <button key={panel} type="button" className={`operate-indicator${counts[panel] > 0 ? ' has-items' : ''}`}
            aria-haspopup="dialog" onClick={() => onOpenPanel(panel)}>
            <span className="operate-indicator-label">{PANEL_LABEL[panel]}</span>
            <b>{counts[panel]}</b>
          </button>
        ))}
      </div>

      {openPanel === 'needs-you' && (
        <Modal title="NEEDS YOU" className="operate-panel" onClose={onClosePanel}>
          {snapshot.needs_you.length === 0
            ? <p className="quiet-note">Nada exige decisão humana explícita agora.</p>
            : <ul className="operate-panel-list">
                {snapshot.needs_you.map(item => (
                  <li key={item.id}>
                    <button type="button" disabled={!item.entity_id}
                      onClick={() => { if (item.entity_id) onFocusEntity(item.entity_id); }}>
                      <span className="operate-panel-domain">{item.domain}</span>
                      <strong>{item.title}</strong>
                      <span className="operate-panel-detail">{item.question}</span>
                    </button>
                  </li>
                ))}
              </ul>}
        </Modal>
      )}

      {openPanel === 'learn' && (
        <Modal title="LEARN / HYPOTHESES" className="operate-panel" onClose={onClosePanel}>
          {hypotheses.length === 0
            ? <p className="quiet-note">Nenhuma hipótese na projeção atual.</p>
            : <ul className="operate-panel-list">
                {hypotheses.map(entity => (
                  <li key={entity.id}>
                    <button type="button" onClick={() => onFocusEntity(entity.id)}>
                      <span className="operate-panel-domain">{entity.domain}</span>
                      <strong>{entity.title}</strong>
                      <span className="operate-panel-detail">{entity.status}</span>
                    </button>
                  </li>
                ))}
              </ul>}
        </Modal>
      )}

      {openPanel === 'capabilities' && (
        <Modal title="CAPABILITIES" className="operate-panel" onClose={onClosePanel}>
          {capabilities.length === 0
            ? <p className="quiet-note">Nenhuma capability na projeção atual.</p>
            : <ul className="operate-panel-list">
                {capabilities.map(entity => (
                  <li key={entity.id}>
                    <button type="button" onClick={() => onFocusEntity(entity.id)}>
                      <span className="operate-panel-domain">{entity.domain}</span>
                      <strong>{entity.title}</strong>
                      <span className="operate-panel-detail">{entity.status}</span>
                    </button>
                  </li>
                ))}
              </ul>}
        </Modal>
      )}

      {openPanel === 'changes' && (
        <Modal title="CHANGES" className="operate-panel" onClose={onClosePanel}>
          {snapshot.changes.length === 0
            ? <p className="quiet-note">
                Nenhuma mudança entre os snapshots publicados disponíveis.
              </p>
            : <ul className="operate-panel-list">
                {snapshot.changes.map(change => (
                  <li key={change.id}>
                    <button type="button" onClick={() => onFocusEntity(change.entity_id)}>
                      <span className="operate-panel-domain">{change.domain}</span>
                      <strong>{change.summary}</strong>
                    </button>
                  </li>
                ))}
              </ul>}
        </Modal>
      )}
    </>
  );
}
