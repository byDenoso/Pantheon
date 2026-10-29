/** Owner/PIN-scoped source retrieval. No caller-controlled URL, headers, role or source. */
export type RetrievalMode = 'auto' | 'exact' | 'lexical';
export interface RetrievalRequest {query: string; k: number; mode: RetrievalMode}
export interface RetrievalCitation {
  canonical_id: string; object_id: string; source_id: string; tower_revision: string;
  path: string; json_pointer: string; entity_version: string | number | null;
  content_sha256: string; [key: string]: unknown;
}
export interface RetrievalHit {
  id: string; title: string; kind: string; state: string; excerpt: string;
  chunk_context: unknown; segments: unknown; citation: RetrievalCitation;
  authority: 'evidence_only'; graph_path: unknown; truncated_source?: boolean;
}
export interface RetrievalResult {
  query: string; role: 'LEARNER'; mode: 'exact' | 'lexical' | 'graph';
  route?: {mode: string; reason: string; [key: string]: unknown};
  snapshot: {source_id: string; revision: string; observed_at: string; [key: string]: unknown};
  authorization_revision: string; method: string; hits: RetrievalHit[];
  answer_status: 'EVIDENCE_FOUND' | 'NO_EVIDENCE_IN_AUTHORIZED_INDEX';
  graph_summary?: Record<string, unknown> | null;
}
export interface IndexProgress {done: boolean; cursor?: string; phase?: string; staged_shards?: number; verified_shards?: number; documents?: number; chunks?: number}
export type RetrievalRead = (request: RetrievalRequest, signal?: AbortSignal) => Promise<unknown>;
export type RetrievalSync = (cursor?: string, signal?: AbortSignal) => Promise<unknown>;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const invalid = (): never => {throw new Error('RETRIEVAL_RESPONSE_INVALID');};
export function parseRetrievalResult(value: unknown): RetrievalResult {
  if (!record(value)) return invalid();
  const snapshot = value.snapshot;
  if (value.role !== 'LEARNER' || !['exact','lexical','graph'].includes(String(value.mode)) ||
      !record(snapshot) || !['source_id','revision','observed_at'].every(k => typeof snapshot[k] === 'string') ||
      typeof value.authorization_revision !== 'string' || value.authorization_revision !== snapshot.revision ||
      typeof value.query !== 'string' || typeof value.method !== 'string' || !Array.isArray(value.hits) || value.hits.length > 50) return invalid();
  if (value.answer_status !== (value.hits.length ? 'EVIDENCE_FOUND' : 'NO_EVIDENCE_IN_AUTHORIZED_INDEX')) return invalid();
  if (value.route !== undefined && (!record(value.route) || typeof value.route.reason !== 'string' || typeof value.route.mode !== 'string')) return invalid();
  const identities = new Set<string>();
  for (const hit of value.hits) {
    if (!record(hit) || !['id','title','kind','state','excerpt'].every(k => typeof hit[k] === 'string') || hit.authority !== 'evidence_only' || !record(hit.citation)) return invalid();
    if (identities.has(hit.id as string)) return invalid();
    identities.add(hit.id as string);
    const c = hit.citation;
    if (!['canonical_id','object_id','source_id','tower_revision','path','json_pointer','content_sha256'].every(k => typeof c[k] === 'string') ||
        c.canonical_id !== hit.id || c.source_id !== snapshot.source_id || c.tower_revision !== snapshot.revision ||
        !["string","number"].includes(typeof c.entity_version) && c.entity_version !== null) return invalid();
  }
  return value as unknown as RetrievalResult;
}
export function parseIndexProgress(value: unknown): IndexProgress {
  if (!record(value) || typeof value.done !== 'boolean' || (!value.done && (typeof value.cursor !== 'string' || !value.cursor))) return invalid();
  for (const key of ['staged_shards','verified_shards','documents','chunks']) if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0)) return invalid();
  if (value.phase !== undefined && typeof value.phase !== 'string') return invalid();
  return value as unknown as IndexProgress;
}
async function bodyOf(response: Response, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  let value: unknown;
  try { value = await response.json(); } catch { throw Object.assign(new Error('RETRIEVAL_UNAVAILABLE'), {status: response.status}); }
  signal?.throwIfAborted();
  if (!response.ok) throw Object.assign(new Error(record(value) && typeof value.error === 'string' ? value.error : 'RETRIEVAL_UNAVAILABLE'), {status: response.status});
  return value;
}
export function createRetrievalTransport(nativeFetch: typeof fetch): RetrievalRead {
  return async (request, signal) => {
    if (!record(request) || Object.keys(request).some(k => !['query','mode','k'].includes(k)) || typeof request.query !== 'string' ||
        !request.query.trim() || Array.from(request.query).length > 4000 || new TextEncoder().encode(request.query).length > 16000 ||
        !['auto','exact','lexical'].includes(String(request.mode)) || !Number.isInteger(request.k) || request.k < 1 || request.k > 50) throw new Error('RETRIEVAL_REQUEST_INVALID');
    signal?.throwIfAborted();
    return bodyOf(await nativeFetch('/api/atlas-retrieval/search', {
      method:'POST', credentials:'same-origin', cache:'no-store', redirect:'error',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({query:request.query,mode:request.mode,k:request.k}), signal,
    }), signal);
  };
}
export function createRetrievalSyncTransport(nativeFetch: typeof fetch): RetrievalSync {
  return async (cursor, signal) => {
    if (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursor.length > 16384)) throw new Error('RETRIEVAL_SYNC_CURSOR_INVALID');
    signal?.throwIfAborted();
    return bodyOf(await nativeFetch('/api/atlas-retrieval/sync', {
      method:'POST', credentials:'same-origin', cache:'no-store', redirect:'error',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify(cursor === undefined ? {} : {cursor}), signal,
    }), signal);
  };
}
/** Per-view memory only; cancellation invalidates even a transport that ignores AbortSignal. */
export function createRetrievalLifetime() {
  let serial = 0, closed = false, controller: AbortController | null = null;
  const cancel = () => {serial++; controller?.abort(); controller = null;};
  return {
    start() {
      if (closed) throw new Error('AUTH_REQUIRED');
      cancel(); controller = new AbortController(); const id = serial, signal = controller.signal;
      return {signal, current: () => !closed && id === serial && !signal.aborted};
    },
    cancel,
    close() {closed = true; cancel();},
  };
}

/** Continue only the user's active refresh; the opaque cursor goes only to the fixed sync route. */
export async function refreshRetrievalIndex(sync: RetrievalSync, operation: {signal: AbortSignal; current: () => boolean}, onProgress: (progress: IndexProgress) => void): Promise<boolean> {
  let cursor: string | undefined;
  while (operation.current()) {
    const value = await sync(cursor, operation.signal);
    if (!operation.current()) return false;
    const step = parseIndexProgress(value);
    if (!step.done && step.cursor === cursor) throw new Error('RETRIEVAL_RESPONSE_INVALID');
    onProgress(step);
    if (step.done) return true;
    cursor = step.cursor;
  }
  return false;
}
