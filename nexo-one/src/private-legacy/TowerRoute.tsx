// Private presentation routes reuse the authenticated runtime and existing 3D renderer.
// The empty private entry opens the web. Legacy hashes remain available unchanged.
import {lazy, Suspense, useEffect, useState, type ReactNode} from 'react';
import {workspaceRoute, type WorkspaceRoute} from '../private-workspace/model.ts';
import {useDocumentLang} from '../i18n/useDocumentLang.ts';
import {WORKSPACE_COPY} from '../private-workspace/copy.ts';
import '../private-workspace/workspace.css';
import {broker, runtimeHolder} from './state.ts';
const PrivateWorkspace = lazy(() => import('../private-workspace/PrivateWorkspace.tsx'));
export type TowerView = 'cosmos' | 'organogram' | null;
export const towerView = (hash: string): TowerView => { const route = workspaceRoute(hash); return route?.page === 'web' ? 'cosmos' : route?.page === 'organogram' ? 'organogram' : null; };
export const isTowerHash = (hash: string) => workspaceRoute(hash) !== null;
const requestNewGeneration = () => broker.request();
export default function TowerRoute({children}: {children: ReactNode}) {
  const m = WORKSPACE_COPY[useDocumentLang()];
  const [route, setRoute] = useState<WorkspaceRoute | null>(() => workspaceRoute(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(workspaceRoute(window.location.hash));
    window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update);
  }, []);
  const runtime = runtimeHolder.get();
  return route ? <Suspense fallback={null}>{runtime && <PrivateWorkspace state={runtime.system} generatedAt={runtime.generated_at} route={route} refresh={requestNewGeneration}/>}</Suspense> : <><a className="pw-legacy-return" href="#/teia">← {m.returnWeb}</a>{children}</>;
}
