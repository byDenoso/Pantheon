import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoadState, SystemState } from '../contracts/system.ts';
import { DataSourceError, activeSource } from './adapters';
import { DEFAULT_SCENARIO_ID } from './fixtures/scenarios.ts';

export interface SystemStore {
  state: SystemState | null;
  load: LoadState;
  error: string;
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
  const controller = useRef<AbortController | null>(null);

  const reload = useCallback(() => setNonce(value => value + 1), []);

  useEffect(() => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setLoad('LOADING');
    setError('');
    activeSource.load({ signal: ctrl.signal, scenarioId })
      .then(next => {
        if (ctrl.signal.aborted) return;
        setState(next);
        // Um estado que não é inteiramente LIVE é PARTIAL, nunca READY silencioso.
        setLoad(next.global_state === 'LIVE' ? 'READY' : 'PARTIAL');
      })
      .catch(failure => {
        if (ctrl.signal.aborted || (failure as Error)?.name === 'AbortError') return;
        const { load: nextLoad, message } = messageFor(failure);
        setLoad(nextLoad);
        setError(message);
        // Erro nunca vira skeleton eterno nem apaga silenciosamente o último estado.
        setState(previous => previous);
      });
    return () => ctrl.abort();
  }, [scenarioId, nonce]);

  return {
    state, load, error,
    sourceKind: activeSource.kind,
    sourceLabel: activeSource.label,
    scenarioId, setScenarioId, reload,
  };
}
