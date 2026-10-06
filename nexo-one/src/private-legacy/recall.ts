// Bounded LOCAL recall over the already-authenticated generation (world.items). Snapshot semantics:
// the query and the matched ids never leave this document (no URL, no network, no log), and no external
// source is consulted. A provider absent from the runtime is reported UNAVAILABLE, never as an empty success.
import type {CockpitItem, ProviderState, ProviderId, WorldState} from '../contracts/world.ts';
import {runtimeHolder} from './state.ts';

export const RECALL_PROVIDERS: readonly ProviderId[] = ['drive', 'gmail', 'github', 'nexo', 'atlas'];
export const MAX_QUERY = 200;
const MAX_RESULTS = 200;

export type LocalRecall = WorldState & {query: string; scope: 'LOCAL_SNAPSHOT'; total_matches: number};

const hay = (i: CockpitItem) => `${i.title ?? ''} ${i.summary ?? ''} ${i.contextId ?? ''}`.toLocaleLowerCase();

/** Pure; same lexical rule the legacy server used (title + summary + context, case-insensitive substring). */
export function recallLocal(world: WorldState, rawQuery: string): LocalRecall {
  const query = String(rawQuery ?? '').trim().slice(0, MAX_QUERY);
  const needle = query.toLocaleLowerCase();
  const all = Array.isArray(world.items) ? world.items : [];
  const matched = needle ? all.filter(i => hay(i).includes(needle)) : [];
  const items = matched.slice(0, MAX_RESULTS);
  const known = new Map((Array.isArray(world.providers) ? world.providers : []).map(p => [p.id, p] as const));
  const providers: ProviderState[] = RECALL_PROVIDERS.map(id => {
    const p = known.get(id);
    if (!p) {
      return {id, label: id, status: 'UNAVAILABLE', lastSuccessAt: null, checkedAt: world.generatedAt, revision: null,
        message: 'Fonte ausente do runtime privado desta geração.', partial: true, count: null};
    }
    // counts are matches inside THIS snapshot, not a provider-side read
    return {...p, count: p.status === 'AVAILABLE' ? matched.filter(i => i.source === id).length : null};
  });
  return {...world, query, scope: 'LOCAL_SNAPSHOT', total_matches: matched.length, items, providers};
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}});

/** Drop-in for the legacy `fetch('/api/recall?q=…')` call (swapped in at build time). In-memory only. */
export async function privateRecall(query: string, signal?: AbortSignal): Promise<Response> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const rt = runtimeHolder.get();
  if (!rt) return json({error: 'PRIVATE_RUNTIME_NOT_LOADED'}, 503);
  if (!String(query ?? '').trim()) return json({error: 'QUERY_REQUIRED'}, 400);
  return json(recallLocal(rt.world, query));
}
