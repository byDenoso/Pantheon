import { useEffect, useState } from 'react';
import type { AtlasApiClient } from '../../api/types';
import { PublicSnapshotSource } from '../../core/PublicSnapshotSource';
import { resolveLearnerLayer } from '../../graph-engine/learner-overlay';
import { ACTIVITY_TABS, UNAVAILABLE_REASONS, type ActivityTab as Tab } from './activity-tabs';

type SearchNode = { id: string; label?: string; type?: string; status?: string };

function DataUnavailable({ reason }: { reason: string }) {
  return (
    <div className="drawer-empty" role="status">
      <span aria-hidden="true">∅</span>
      <p>DATA_UNAVAILABLE</p>
      <small>{reason}</small>
    </div>
  );
}

/**
 * Bottom drawer with the four tabs the shell spec calls for. Each tab renders real
 * state, an honest empty state, or DATA_UNAVAILABLE with a reason -- never a dead
 * button or a fabricated row. "Mudanças" and "Próximas ações" have no backing reader
 * in the current public/static pipeline (confirmed against every existing api/*.js
 * handler and PublicSnapshotSource); "Testes" uses the real search index; "Filamentos"
 * uses the same evidence-gated Learner state machine as the Cockpit.
 */
export function ActivityDrawer({ api }: { api: AtlasApiClient }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('changes');
  const [tests, setTests] = useState<{ state: 'loading' | 'ready' | 'empty' | 'error'; items: SearchNode[] }>({ state: 'loading', items: [] });
  const [learnerUnavailable, setLearnerUnavailable] = useState(true);

  useEffect(() => {
    if (tab !== 'tests' || tests.state !== 'loading') return;
    let live = true;
    void (api.graph({ mode: 'search', type: 'TEST', limit: 8 }) as Promise<{ nodes?: SearchNode[] }>)
      .then(result => {
        if (!live) return;
        const items = result?.nodes || [];
        setTests({ state: items.length ? 'ready' : 'empty', items });
      })
      .catch(() => {
        if (live) setTests({ state: 'error', items: [] });
      });
    return () => {
      live = false;
    };
  }, [api, tab, tests.state]);

  useEffect(() => {
    if (tab !== 'filaments') return;
    let live = true;
    const source = new PublicSnapshotSource(api);
    void source.getLearnerLayer().then(envelope => {
      if (live) setLearnerUnavailable(envelope.state === 'DATA_UNAVAILABLE');
    });
    return () => {
      live = false;
    };
  }, [api, tab]);

  const learnerReference = resolveLearnerLayer([
    { id: 'reference', sourceNodeId: 'campaign:gz-01-b02', targetNodeId: null, state: 'pending', observedAt: null, sourceRef: null, consumptionProof: null }
  ])[0];

  return (
    <div className={`activity-drawer ${open ? 'is-open' : ''}`}>
      <button type="button" className="activity-drawer-handle" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="activity-drawer-body">
        <span aria-hidden="true">{open ? '▾' : '▴'}</span>
        <span>Atividade</span>
      </button>
      {open && (
        <div id="activity-drawer-body" className="activity-drawer-body">
          <nav className="activity-drawer-tabs" aria-label="Abas de atividade">
            {ACTIVITY_TABS.map(item => (
              <button key={item.id} className={tab === item.id ? 'active' : ''} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="activity-drawer-panel">
            {tab === 'changes' && <DataUnavailable reason={UNAVAILABLE_REASONS.changes} />}
            {tab === 'next' && <DataUnavailable reason={UNAVAILABLE_REASONS.next} />}
            {tab === 'tests' && (
              <>
                {tests.state === 'loading' && <p role="status">Lendo índice de busca…</p>}
                {tests.state === 'error' && <DataUnavailable reason="Falha ao ler o índice de busca público." />}
                {tests.state === 'empty' && <DataUnavailable reason="Nenhum teste publicado no snapshot atual." />}
                {tests.state === 'ready' && (
                  <ul className="activity-drawer-list">
                    {tests.items.map(item => (
                      <li key={item.id}>
                        <a href={`/pesquisa/testes/${encodeURIComponent(item.id)}`}>{item.label || item.id}</a>
                        <small>{item.status || 'UNKNOWN'}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {tab === 'filaments' && (
              <>
                {learnerUnavailable ? (
                  <DataUnavailable reason="O snapshot público atual não publica estado do scheduler Learner." />
                ) : (
                  <p>
                    Referência: <b>{learnerReference.legendText}</b>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
