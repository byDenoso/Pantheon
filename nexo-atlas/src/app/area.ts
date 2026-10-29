// Hash router for the two areas. Pure helpers + a tiny external store so React
// (useSyncExternalStore) re-renders on hashchange/popstate.
export type Area = 'public' | 'private';
const PRIVATE_HASH = /^#\/?privado(?:[/?]|$)/;
export const areaFromHash = (hash: string): Area => (PRIVATE_HASH.test(hash) ? 'private' : 'public');

type EventTargetLike = {addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void; location: {hash: string}};

export function createAreaStore(win: EventTargetLike) {
  return {
    getSnapshot: (): Area => areaFromHash(win.location.hash),
    subscribe(cb: () => void) {
      win.addEventListener('hashchange', cb);
      win.addEventListener('popstate', cb);
      return () => { win.removeEventListener('hashchange', cb); win.removeEventListener('popstate', cb); };
    },
  };
}
