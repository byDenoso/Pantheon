import {useEffect, useState} from 'react';
import App from '../app/App';
import {NexoStoreProvider} from '../data/NexoStore.tsx';
import {FRAME, parseToFrame, trusted} from './protocol.ts';
import {validateRuntime} from './runtime.ts';
import {guards} from './install.ts';
import {applyRefresh} from './refresh.ts';
import TowerRoute from './TowerRoute.tsx';
import {towerMemory} from '../tower-web/memory.ts';
import {broker, postToParent, runtimeHolder} from './state.ts';

type Phase = {kind: 'wait'} | {kind: 'ready'; gen: number} | {kind: 'failed'} | {kind: 'closed'} | {kind: 'orphan'};

export default function Host() {
  const [phase, setPhase] = useState<Phase>(() => (window.parent === window ? {kind: 'orphan'} : {kind: 'wait'}));
  useEffect(() => {
    if (window.parent === window) return;
    const close = () => { broker.failAll('CLOSED'); runtimeHolder.clear(); towerMemory.clear(); guards.storage.local.clear(); guards.storage.session.clear(); setPhase({kind: 'closed'}); };
    const onMessage = (ev: MessageEvent) => {
      if (!trusted(ev, window.location.origin, window.parent)) return;
      const msg = parseToFrame(ev.data);
      if (!msg) return;
      if (msg.type === 'TEARDOWN') { close(); return; }
      // language of the shell: presentation only. It sets <html lang>; views that read it re-render in place (no remount, no data touched)
      if (msg.type === 'LOCALE') { document.documentElement.lang = msg.locale; return; }
      if (msg.type === 'REFRESH_FAILED') { broker.settle(msg.id, {ok: false, code: msg.code}); return; }
      if (msg.type === 'RUNTIME_REFRESH') {
        if (!broker.has(msg.id)) return; // only a generation this frame asked for
        const applied = applyRefresh(runtimeHolder, msg.data);
        if (applied.kind === 'invalid') {
          runtimeHolder.clear(); towerMemory.clear(); setPhase({kind: 'failed'});
          broker.settle(msg.id, {ok: false, code: applied.code});
          postToParent({channel: FRAME, type: 'ERROR', code: applied.code});
        } else if (applied.kind === 'stale') broker.settle(msg.id, {ok: false, code: 'STALE_GENERATION'});
        else {
          // a different generation rebuilds the whole store: no cached state of the old one survives
          if (applied.changed) setPhase({kind: 'ready', gen: runtimeHolder.generation()});
          broker.settle(msg.id, {ok: true});
        }
        return;
      }
      const check = validateRuntime(msg.data);
      if (!check.ok) {
        runtimeHolder.clear(); towerMemory.clear(); setPhase({kind: 'failed'});
        postToParent({channel: FRAME, type: 'ERROR', code: check.code});
        return;
      }
      runtimeHolder.set(check.runtime);
      setPhase({kind: 'ready', gen: runtimeHolder.generation()});
      postToParent({channel: FRAME, type: 'ACCEPTED'});
    };
    const onPreloadError = () => postToParent({channel: FRAME, type: 'ERROR', code: 'CHUNK_LOAD'});
    window.addEventListener('message', onMessage);
    window.addEventListener('pagehide', close);
    window.addEventListener('vite:preloadError', onPreloadError);
    postToParent({channel: FRAME, type: 'READY'});
    return () => {
      window.removeEventListener('message', onMessage); window.removeEventListener('pagehide', close);
      window.removeEventListener('vite:preloadError', onPreloadError); runtimeHolder.clear(); towerMemory.clear();
    };
  }, []);
  if (phase.kind === 'ready') return <TowerRoute key={phase.gen}><NexoStoreProvider><App/></NexoStoreProvider></TowerRoute>;
  if (phase.kind === 'failed') return <main role="alert" style={{padding: 24, font: '16px system-ui'}}>O servidor entregou um estado privado inconsistente. Nenhum dado foi exibido.</main>;
  if (phase.kind === 'orphan') return <main style={{padding: 24, font: '16px system-ui'}}>Esta visão só abre dentro da área privada.</main>;
  return null;
}
