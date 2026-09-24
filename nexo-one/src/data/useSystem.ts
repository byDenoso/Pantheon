import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoadState, SystemState } from '../contracts/system.ts';
import { onSessionChange } from '../contracts/session-events.ts';
import { DataSourceError, activeSource } from './adapters';
import { preserveStateOnFailure } from './adapters/source.ts';
import { DEFAULT_SCENARIO_ID } from './fixtures/scenarios.ts';
import { dispatchProjectionSync, waitForProjectionSync } from './projectionSync.ts';

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
  /** Dispara o pipeline real de sincronização e só conclui após readback do mesmo request_id. */
  sync: () => void;
  /** Revalida somente a origem atualmente publicada; não dispara pipeline. */
  reload: () => void;
  /** Após um disparo manual no GitHub, relê a projeção até ela mudar. */
  watchForPublication: () => void;
  watching: boolean;
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
  const [watching, setWatching] = useState(false);
  const watchingRef = useRef(false);
  watchingRef.current = watching;
  const [lastSuccessfulReadAt, setLastSuccessfulReadAt] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const syncController = useRef<AbortController | null>(null);
  const stateRef = useRef<SystemState | null>(null);
  const forceNextRead = useRef(false);
  const lastReadAt = useRef(0);

  const reload = useCallback(() => {
    forceNextRead.current = true;
    setNonce(value => value + 1);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || activeSource.kind !== 'remote') return;
    return onSessionChange(window, reload);
  }, [reload]);

  useEffect(() => {
    if (typeof window === 'undefined' || activeSource.kind !== 'remote') return;

    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !syncController.current) reload();
    }, 60_000);

    // Returning to the tab only re-reads when the last read is stale; phones
    // flip visibility constantly and each re-read downloads the whole state.
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || syncController.current) return;
      if (Date.now() - lastReadAt.current < 60_000) return;
      reload();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
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
        lastReadAt.current = Date.now();
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

  const watchTimer = useRef<number | null>(null);
  const syncRef = useRef<() => void>(() => {});
  // Sem bridge na Vercel, o disparo real é o "Run workflow" do GitHub. Depois dele,
  // relemos a projeção publicada a cada 40 s até o fingerprint mudar (máx. 15 min).
  const watchForPublication = useCallback(() => {
    if (watchTimer.current) window.clearInterval(watchTimer.current);
    const startedAt = Date.now();
    const baseline = stateRef.current?.bus.fingerprint;
    setWatching(true);
    setSyncMessage('Aguardando o GitHub publicar a nova projeção…');
    watchTimer.current = window.setInterval(() => {
      const current = stateRef.current?.bus.fingerprint;
      const elapsed = Date.now() - startedAt;
      if ((baseline && current && current !== baseline) || elapsed > 15 * 60_000) {
        if (watchTimer.current) window.clearInterval(watchTimer.current);
        watchTimer.current = null;
        setWatching(false);
        if (elapsed > 15 * 60_000 && current === baseline) setSyncMessage('Publicação não detectada em 15 min · confira o workflow no GitHub');
        return;
      }
      syncRef.current();
    }, 40_000);
  }, []);
  useEffect(() => () => { if (watchTimer.current) window.clearInterval(watchTimer.current); }, []);

  const sync = useCallback(() => {
    const previous = stateRef.current;
    if (!previous || activeSource.kind !== 'remote') {
      reload();
      return;
    }

    syncController.current?.abort();
    const ctrl = new AbortController();
    syncController.current = ctrl;
    const previousFingerprint = previous.bus.fingerprint;

    setError('');
    setSyncStatus('SYNCING');
    setSyncMessage('Disparando sincronização real…');

    void (async () => {
      try {
        const receipt = await dispatchProjectionSync(previousFingerprint, ctrl.signal);
        if (ctrl.signal.aborted || syncController.current !== ctrl) return;

        if (receipt.outcome === 'PUBLIC_PROJECTION_REFRESHED' || receipt.outcome === 'PUBLIC_PROJECTION_CACHED') {
          const cached = receipt.outcome === 'PUBLIC_PROJECTION_CACHED';
          if (!cached) setLastSuccessfulReadAt(new Date().toISOString());
          const changedAtOrigin = previousFingerprint !== receipt.projection_fingerprint;
          if (changedAtOrigin && !cached) {
            // Fallback sem bridge: a projeção publicada mudou, então o estado precisa ser relido.
            setSyncMessage('Nova projeção publicada · atualizando estado…');
            const next = await activeSource.load({ signal: ctrl.signal, scenarioId, force: true });
            if (ctrl.signal.aborted || syncController.current !== ctrl) return;
            stateRef.current = next;
            setState(next);
            setLoad(next.global_state === 'LIVE' ? 'READY' : 'PARTIAL');
          }
          setSyncStatus(changedAtOrigin && !cached ? 'CHANGED' : 'UNCHANGED');
          setSyncMessage(cached
            ? 'Origem temporariamente indisponível · cache validado recente preservado'
            : changedAtOrigin
              ? 'Nova projeção pública detectada · ' + receipt.active_work + ' WORK · snapshot Pages validado'
              : watchingRef.current
                ? 'Aguardando o GitHub publicar a nova projeção… · verificado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : 'Sem alterações · projeção pública validada diretamente');
          return;
        }

        setSyncMessage(receipt.deduplicated
          ? 'Sincronização já em andamento · aguardando readback…'
          : 'Dispatch aceito · aguardando publicação…');

        await waitForProjectionSync(receipt.request_id, ctrl.signal);
        if (ctrl.signal.aborted || syncController.current !== ctrl) return;

        setSyncMessage('Publicação confirmada · atualizando estado…');
        const next = await activeSource.load({ signal: ctrl.signal, scenarioId, force: true });
        if (ctrl.signal.aborted || syncController.current !== ctrl) return;

        stateRef.current = next;
        setState(next);
        setLoad(next.global_state === 'LIVE' ? 'READY' : 'PARTIAL');
        setLastSuccessfulReadAt(new Date().toISOString());

        const changed = previousFingerprint !== next.bus.fingerprint;
        setSyncStatus(changed ? 'CHANGED' : 'UNCHANGED');
        setSyncMessage(changed ? 'Nova projeção publicada' : 'Sem alterações · sincronização concluída');
      } catch (failure) {
        if (ctrl.signal.aborted || syncController.current !== ctrl || (failure as Error)?.name === 'AbortError') return;
        const { load: nextLoad, message } = messageFor(failure);
        setError(message);
        if (previous && preserveStateOnFailure(nextLoad)) {
          setLoad(previous.global_state === 'LIVE' ? 'READY' : 'PARTIAL');
          setSyncStatus('FAILED');
          setSyncMessage(failure instanceof DataSourceError && /snapshot/i.test(failure.message)
            ? 'Snapshot publicado indisponível'
            : 'Sincronização não confirmada');
        } else {
          setLoad(nextLoad);
          setSyncStatus('FAILED');
          setSyncMessage('Sincronização falhou');
        }
      } finally {
        if (syncController.current === ctrl) syncController.current = null;
      }
    })();
  }, [reload, scenarioId]);
  syncRef.current = sync;

  return {
    watchForPublication, watching,
    state, load, error,
    syncing: syncStatus === 'SYNCING',
    syncStatus,
    syncMessage,
    lastSuccessfulReadAt,
    sourceKind: activeSource.kind,
    sourceLabel: activeSource.label,
    scenarioId, setScenarioId, sync, reload,
  };
}
