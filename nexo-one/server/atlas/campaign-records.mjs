import {createHash} from 'node:crypto';

export const EVENT_SCHEMA = 'NEXO_CAMPAIGN_EVENT_V1';
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
const ROLES = {
  METHOD:['CIENTISTA'], ASSIGNMENT:['CIENTISTA','MAESTRO'], RUN:['EXECUTOR'], RESULT:['EXECUTOR'],
  REVIEW:['CRITICO'], MANUSCRIPT:['EDITOR'], SYNTHESIS:['EDITOR','SINTETIZADOR'], PATCH:['EXECUTOR','ENGENHEIRO'],
  CHECKPOINT:['CIENTISTA','EXECUTOR','CRITICO','EDITOR','MAESTRO','ENGENHEIRO','SINTETIZADOR'],
  LOG:['CIENTISTA','EXECUTOR','CRITICO','EDITOR','MAESTRO','ENGENHEIRO','SINTETIZADOR'],
};
export const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const stable = v => JSON.stringify(v, (_, x) => object(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k,x[k]])) : x);
export function requireValue(value, code) { if (!value) throw new Error(code); }

function jsonSafe(value, depth = 0) {
  requireValue(depth <= 40, 'EVENT_TOO_DEEP');
  requireValue(value === null || ['string','boolean','number','object'].includes(typeof value), 'NON_JSON_VALUE');
  if (typeof value === 'number') requireValue(Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)), 'UNSAFE_JSON_NUMBER');
  if (object(value)) for (const [key,item] of Object.entries(value)) {
    requireValue(!['__proto__','constructor','prototype'].includes(key), 'EVENT_KEY_INVALID'); jsonSafe(item, depth+1);
  }
  else if (Array.isArray(value)) for (const item of value) jsonSafe(item, depth+1);
}

// JSON.parse validates grammar; this independent token walk rejects duplicate
// object keys that JSON.parse would silently overwrite (also at nested levels).
function uniqueKeys(text) {
  const tokens = text.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) || [];
  const stack = [];
  for (const token of tokens) {
    if (token === '{' || token === '[') stack.push({object:token === '{',keys:new Set(),key:true});
    else if (token === '}' || token === ']') stack.pop();
    else {
      const top = stack.at(-1);
      if (!top?.object) continue;
      if (token === ',') top.key = true;
      else if (token === ':') top.key = false;
      else if (top.key && token[0] === '"') {
        const key = JSON.parse(token);
        requireValue(!top.keys.has(key), 'DUPLICATE_JSON_KEY'); top.keys.add(key);
      }
    }
  }
}
export const eventIdentity = e => 'EV-' + sha256([e.campaign_id,e.role,e.kind,e.entity_id,String(e.version)].join('\n'));
export function validateEvent(e, campaignId) {
  requireValue(object(e) && e.schema === EVENT_SCHEMA, 'EVENT_SCHEMA_UNSUPPORTED');
  jsonSafe(e);
  for (const key of ['campaign_id','entity_id','actor_id']) requireValue(typeof e[key] === 'string' && ID.test(e[key]), 'EVENT_ID_INVALID');
  requireValue(!campaignId || e.campaign_id === campaignId, 'CAMPAIGN_ID_MISMATCH');
  requireValue(Number.isSafeInteger(e.version) && e.version >= 1, 'EVENT_VERSION_INVALID');
  requireValue(Object.hasOwn(ROLES,e.kind) && ROLES[e.kind].includes(e.role), 'EVENT_ROLE_KIND_MISMATCH');
  requireValue(e.access === 'PRIVATE' && ['PRIVATE','EXCLUDED'].includes(e.atlas_scope), 'EVENT_ACCESS_INVALID');
  requireValue(object(e.data), 'EVENT_DATA_INVALID');
  requireValue(typeof e.timestamp_utc === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(e.timestamp_utc) && Number.isFinite(Date.parse(e.timestamp_utc)) && new Date(e.timestamp_utc).toISOString().slice(0,19) === e.timestamp_utc.slice(0,19), 'EVENT_TIMESTAMP_INVALID');
  requireValue(e.event_id === eventIdentity(e), 'EVENT_IDENTITY_MISMATCH');
  return e;
}
export function parseEvent(raw, campaignId) {
  requireValue(raw.byteLength <= 5*1024*1024, 'EVENT_TOO_LARGE');
  const text = new TextDecoder('utf-8',{fatal:true}).decode(raw).replace(/^\uFEFF/, '');
  const value = JSON.parse(text); uniqueKeys(text);
  return validateEvent(value,campaignId);
}

const excludedScience = /(?:^|[^a-z0-9])peer(?:[^a-z0-9]|$)/i;
export const atlasCampaignAllowed = campaignId => typeof campaignId === 'string' && !excludedScience.test(campaignId);
export const atlasEligible = event => event.atlas_scope === 'PRIVATE' && !excludedScience.test(stable(event)) && !/NO_ATLAS_EXPORT|ATLAS_EXCLUDED/i.test(stable(event));

/** An observed per-file revision set, not a fictional cross-file Drive CAS. */
export function normalizeCampaignObservation(observations, {campaignId, folderId, generatedAt, unparsed = 0} = {}) {
  requireValue(ID.test(campaignId) && typeof folderId === 'string' && /^[A-Za-z0-9_-]+$/.test(folderId), 'CAMPAIGN_SCOPE_INVALID');
  requireValue(atlasCampaignAllowed(campaignId), 'CAMPAIGN_EXCLUDED');
  const unique = new Map(), excludedIds = new Set();
  for (const observation of observations) {
    const e = validateEvent(observation.event, campaignId);
    requireValue(typeof observation.file_id === 'string' && /^[A-Za-z0-9_-]+$/.test(observation.file_id)
      && typeof observation.version === 'string' && /^\d+$/.test(observation.version)
      && typeof observation.sha256 === 'string' && /^[a-f0-9]{64}$/.test(observation.sha256), 'EVENT_PROVENANCE_INVALID');
    const prior = unique.get(e.event_id);
    requireValue(!prior || stable(prior.event) === stable(e), 'EVENT_CONTENT_CONFLICT');
    if (!atlasEligible(e)) excludedIds.add(e.event_id);
    if (!prior) unique.set(e.event_id,{event:e,sources:[observation]}); else prior.sources.push(observation);
  }
  // Exclusion follows explicit entity/file/event references, not only labels.
  const excludedRefs = new Set();
  const referencesExcluded = value => typeof value === 'string'
    ? [...excludedRefs].some(ref => value === ref || value.startsWith('gdrive-file://'+ref+'@'))
    : Array.isArray(value) ? value.some(referencesExcluded)
    : object(value) ? Object.values(value).some(referencesExcluded) : false;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id,row] of unique) if (excludedIds.has(id)) {
      excludedRefs.add(id); excludedRefs.add(row.event.entity_id);
      for (const source of row.sources) excludedRefs.add(source.file_id);
    }
    for (const [id,row] of unique) if (!excludedIds.has(id) && (referencesExcluded(row.event.data) || excludedRefs.has(row.event.entity_id))) {
      excludedIds.add(id); changed = true;
    }
  }
  const events = [...unique].filter(([id]) => !excludedIds.has(id)).map(([,row]) => ({...row,event:structuredClone(row.event)}));
  for (const row of events) row.sources.sort((a,b) => a.file_id.localeCompare(b.file_id));
  events.sort((a,b) => a.event.event_id.localeCompare(b.event.event_id));
  const sources = events.flatMap(row => row.sources.map(s => ({file_id:s.file_id,version:s.version,sha256:s.sha256,mime_type:s.mime_type})))
    .sort((a,b) => a.file_id.localeCompare(b.file_id));
  const revision = 'sha256:' + sha256(stable({campaignId,folderId,sources,unparsed}));
  return {campaignId,folderId,generatedAt,revision,events,sources,
    coverage:{scope:'SELECTED_CAMPAIGN_ONLY',consistency:'OBSERVED_FILE_REVISIONS_NOT_ATOMIC',
      unparsed_artifacts:unparsed,complete_inventory:true,scientific_coverage:'NOT_INFERRED'},
    sourceRef:`gdrive-campaign://${folderId}@${revision}`};
}
