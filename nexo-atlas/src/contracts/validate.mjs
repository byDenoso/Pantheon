export const PROVIDERS = ['drive','gmail','calendar','github','vercel','nexo','atlas'];
export const CONTEXTS = ['NEXO','COSMOLOGY','OLYMPUS','ENGINEERING','PERSONAL'];
export const LOOP_STATES = ['NEEDS_ME','WAITING_OTHER','SCHEDULED','BLOCKED','DONE'];
export const isDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function validateItem(x, provider) {
  if (!x || typeof x !== 'object') return false;
  return typeof x.id === 'string' && x.id.startsWith(`${provider}:`) && x.id.length > provider.length + 1
    && typeof x.title === 'string' && x.title.trim().length > 0 && x.title.length <= 1000
    && PROVIDERS.includes(x.source) && x.source === provider && !!safeUrl(x.sourceRef)
    && ['FILE','MESSAGE','EVENT','ISSUE','DEPLOYMENT','ACTION','ENTITY'].includes(x.kind)
    && ['CANONICAL','PROVIDER','DERIVED'].includes(x.authority)
    && ['IGNORE','NOTICE','ACT','ESCALATE'].includes(x.attention)
    && ['LIVE','SNAPSHOT','STALE'].includes(x.freshness?.state)
    && isDate(x.freshness?.observedAt) && isDate(x.freshness?.expiresAt) && isDate(x.observedAt)
    && (!x.contextId || CONTEXTS.includes(x.contextId)) && (!x.status || LOOP_STATES.includes(x.status))
    && (!x.dueAt || isDate(x.dueAt)) && (!x.endAt || isDate(x.endAt))
    && (x.allDay === undefined || typeof x.allDay === 'boolean')
    && (x.summary === undefined || typeof x.summary === 'string')
    && (x.nextAction === undefined || typeof x.nextAction === 'string')
    && (x.waitingOn === undefined || (Array.isArray(x.waitingOn) && x.waitingOn.every(v=>typeof v === 'string')))
    && Array.isArray(x.actions) && x.actions.every(a => a && typeof a.id === 'string' && typeof a.label === 'string' && a.kind === 'OPEN_SOURCE' && safeUrl(a.url));
}
