// Private presentation routes reuse the authenticated runtime and existing 3D renderer.
// Legacy bookmarks migrate into the current workspace without loading the retired app.
import {lazy, Suspense, useEffect, useState} from 'react';
import {workspaceRoute, type WorkspaceRoute} from '../private-workspace/model.ts';
import {useDocumentLang} from '../i18n/useDocumentLang.ts';
import {privateEntryHash} from '../atlas/privateEntry.ts';
import '../private-workspace/workspace.css';
import {broker, runtimeHolder} from './state.ts';
const PrivateWorkspace = lazy(() => import('../private-workspace/PrivateWorkspace.tsx'));
const MemoryView = lazy(() => import('../private-memory/MemoryView.tsx'));
const ReadToolsStatus = lazy(() => import('../private-memory/ReadToolsStatus.tsx'));
export type TowerView = 'cosmos' | 'organogram' | null;
export const towerView = (hash: string): TowerView => { const route = workspaceRoute(hash); return route?.page === 'web' ? 'cosmos' : route?.page === 'organogram' ? 'organogram' : null; };
export const isTowerHash = (hash: string) => workspaceRoute(hash) !== null;
const requestNewGeneration = () => broker.request();
export default function TowerRoute() {
  const lang=useDocumentLang();
  const [route, setRoute] = useState<WorkspaceRoute | null>(() => workspaceRoute(privateEntryHash(window.location.hash)));
  useEffect(() => {
    const update = () => {
      const hash = privateEntryHash(window.location.hash);
      if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
      setRoute(workspaceRoute(hash));
    };
    update();
    window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update);
  }, []);
  const runtime = runtimeHolder.get();
  return route ? <Suspense fallback={<main className="pw-page" role="status" aria-busy="true">{lang==='en'?'Opening your workspace…':'Abrindo seu espaço…'}</main>}>{runtime && <PrivateWorkspace state={runtime.system} generatedAt={runtime.generated_at} route={route} refresh={requestNewGeneration} memory={<MemoryView lang={lang} bridge={<ReadToolsStatus lang={lang}/>}/>}/>}</Suspense> : null;
}
