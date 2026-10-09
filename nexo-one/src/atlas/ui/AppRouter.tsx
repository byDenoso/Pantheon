import {lazy, Suspense, useMemo, useSyncExternalStore} from 'react';
import {createAreaStore} from '../../app/area.ts';
import PublicApp from './PublicApp.tsx';

// The private area is a separate chunk and is unmounted (state destroyed) when the route leaves it.
const PrivateApp = lazy(() => import('./PrivateApp.tsx'));
const HumanAutonomyApp = lazy(() => import('./HumanAutonomyApp.tsx'));

export default function AppRouter() {
  const store = useMemo(() => createAreaStore(window), []);
  const area = useSyncExternalStore(store.subscribe, store.getSnapshot, () => 'public' as const);
  if (window.location.pathname.replace(/\/$/, '') === '/autonomy') return <Suspense fallback={null}><HumanAutonomyApp/></Suspense>;
  return area === 'private'
    ? <Suspense fallback={null}><PrivateApp key="private"/></Suspense>
    : <PublicApp key="public"/>;
}
