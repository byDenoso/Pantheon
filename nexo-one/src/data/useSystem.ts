import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoadState, SystemState } from '../contracts/system.ts';
import { onSessionChange } from '../contracts/session-events.ts';
import { DataSourceError, activeSource } from './adapters';
import { preserveStateOnFailure } from './adapters/source.ts';
import { DEFAULT_SCENARIO_ID } from './fixtures/scenarios.ts';

export type SyncStatus = 'IDLE' | 'SYNCING' | 'CHANGED' | 'UNCHANGED' | 'FAILED';

export interface SystemStore {
  state: SystemState | null;
  load: LoadState;
  error: string;
  /** Atualização explícita nunca apaga o último snapshot válido enquanto a nova leitura está em voo. */
  syncing: boolean;
  syncStatus: SyncStatus;
  syncMessage: string;
  lastSuccessfulReadAt: string | null;
  /** Origem ativa; `fixture` deve permanecer visível na interface. */
  sourceKind: 'fixture' | 'remote';
  sourceLabel: string;
  scenarioId: string;
  setScenarioId: (id: string) => void;
  reload: () => void;
}

const messageFor = (error: unknown): { load: LoadState; message: string } => {
  if (error instanceof DataSourceError) {
    if (error.code === 'UNAUTHORIZED') return { load: 'UNAUTHORIZED', message: error.message };
    return { load: 'ERROR', message: error.message };
  }
  return { load: 'ERROR', message: 'Não foi possível compilar o estado do sistema.' };
};

export function useSystem(initialScenario = DEFAULT_SCENARIO_ID): SystemStore {
  const [state, setState] = useState<SystemState | null>(null);
  const [load, setLoad] = useState<LoadState>('LOADING');
  const [error, setError] = useState('');
  const [scenarioId, setScenarioId] = useState(initialScenario);
  const [nonce, setNonce] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('IDLE');
  const [syncMessage, setSyncMessage] = useState('');
  const [lastSuccessfulReadAt, setLastSuccessfulReadAt] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const stateRef = useRef<SystemState | null>(null);
  const forceNextRead = useRef(false);

  const reload = useCallback(() => {
    forceNextRead.current = true;
    setNonce(value => value + 1);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || activeSource.kind !== 'remote') return;
    return onSessionChange(window, reload);
  }, [reload]);

  useEffect(() => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;

    const previous = stateRef.current;
    const isRefresh = previous !== null;
    const force = forceNextRead.current;
    forceNextRead.current = false;

    if (!isRefresh) setLoad('LOADING');
    setError('');
    if (isRefresh) {
      setSyncStatus('SYNCING');
      setSyncMessage('Atualizando leitura…');
    }

    activeSource.load({ signal: ctrl.signal, scenarioId, force })
      .then(next => {
        if (ctrl.signal.aborted || controller.current !== ctrl) return;

        const previousFingerprint = previous?.bus.fingerprint ?? null;
        stateRef.current = next;
        setState(next);
        setLoad(next.global_state === 'LIVE' ? 'READY' : 'PARTIAL');
        setLastSuccessfulReadAt(new Date().toISOString());

        if (isRefresh) {
          const changed = previousFingerprint !== next.bus.fingerprint;
          setSyncStatus(changed ? 'CHANGED' : 'UNCHANGED');
          setSyncMessage(changed ? 'Nova projeção publicada' : 'Sem alterações');
        } else {
          setSyncStatus('IDLE');
          setSyncMessage('');
        }
      })
      .catch(failure => {
        if (ctrl.signal.aborted || controller.current !== ctrl || (failure as Error)?.name === 'AbortError') return;

        const { load: nextLoad, message } = messageFor(failure);
        setError(message);

        if (previous && preserveStateOnFailure(nextLoad)) {
          // Falha transitória: conserva o snapshot anterior e o marca como degradado
          // na UI, em vez de trocar todo o cockpit por uma tela de erro.
          setLoad(previous.global_state === 'LIVE' ? 'READY' : 'PARTIAL');
          setSyncStatus('FAILED');
          setSyncMessage('Falha na atualização');
          return;
        }

        setLoad(nextLoad);
        setSyncStatus('IDLE');
        setSyncMessage('');
        stateRef.current = null;
        setState(null);
      });

    return () => ctrl.abort();
  }, [scenarioId, nonce]);

  return {
    state, load, error,
    syncing: syncStatus === 'SYNCING',
    syncStatus,
    syncMessage,
    lastSuccessfulReadAt,
    sourceKind: activeSource.kind,
    sourceLabel: activeSource.label,
    scenarioId, setScenarioId, reload,
  };
}
