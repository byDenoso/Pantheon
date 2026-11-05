import {createHash} from 'node:crypto';

/**
 * Owner-chosen public selection for nexoresearch.org.
 *
 * The owner chooses, in the private cockpit, what the public site shows:
 *  - catalog: rows of the already published, reviewed catalog (identified by the
 *    same SHA-256 publication key the public build uses);
 *  - tower: SHADOW RESULTADOS rows, published only with public text the owner wrote;
 *  - campaigns: SHADOW ROADMAP fronts, published only with public text the owner wrote.
 *
 * Nothing here reads or writes the Tower. The stored document holds only the
 * owner-approved public text plus the digest of the source row it was approved
 * against, so the cockpit can flag later source changes. The public route never
 * reads Drive: it serves this stored document, revalidated on every read.
 */

export const SELECTION_CONTRACT = 'NEXO_PUBLIC_SELECTION_V1';
export const PUBLIC_SELECTION_CONTRACT = 'ATLAS_PUBLIC_SELECTION_V1';
export const LIMITS = Object.freeze({catalog: 1000, tower: 200, campaigns: 60, text: 1500, title: 300, body: 1024 * 1024});

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = value => createHash('sha256').update(value).digest('hex');
const stable = value => Array.isArray(value) ? value.map(stable) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;

// Same families the reviewed public catalog already excludes (nexo-atlas/worker/public-tests.mjs),
// plus the operational surfaces that must never reach the public site.
const EXCLUDED = /(?:\bolymp[a-z0-9_-]*\b|\boly(?:[-_]|aut|cause|phys|pivot)[a-z0-9_-]*\b|(?<![\p{L}\p{N}])p[. _-]*e[. _-]*e?[. _-]*r(?![\p{L}\p{N}])|\b(?:pcdm|pngb|miq|miqueias)\b|\bBOARD\b|\bmural\b|\bS[1-7]\b|\bintegrador\s+P\b)/iu;
const INTERNAL = /(?:https?:\/\/|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:CONTEST-|WORK-|HYP-|T-SCI-|T-META-|ROADMAP-|REQ-|INBOX-|prj_|appgprj_|env_)[A-Z0-9_-]+|\b[a-f0-9]{24,}\b|\b(?:PRIVATE KEY|GOOGLE_REFRESH_TOKEN|NEXO_ATLAS_PIN_HASH|Bearer)\b|sk-proj-|gh[pousr]_|AIza[\w-]{30,}|(?:access[_-]?token|authorization|api[_-]?key|password|secret)\s*[:=]|(?:[A-Z]:\\|file:\/\/|drive:\/\/|_source_path|localhost|127\.0\.0\.1))/i;

/** Why a public text is refused, or null when it may be published. */
export function textProblem(value, max = LIMITS.text) {
  if (typeof value !== 'string' || !value.trim()) return 'EMPTY';
  if (value.length > max) return 'TOO_LONG';
  const normalized = value.normalize('NFKC');
  if (EXCLUDED.test(normalized)) return 'RESTRICTED_FAMILY';
  if (INTERNAL.test(normalized)) return 'INTERNAL_REFERENCE';
  return null;
}

/** Owner text: Portuguese required, English optional (falls back to the Portuguese text, as in the reviewed catalog). */
export function bilingual(value, max = LIMITS.text) {
  if (!object(value)) return {error: 'EMPTY'};
  const pt = typeof value['pt-BR'] === 'string' ? value['pt-BR'].trim() : '';
  const enRaw = typeof value.en === 'string' ? value.en.trim() : '';
  const en = enRaw || pt;
  const problem = textProblem(pt, max) ?? textProblem(en, max);
  return problem ? {error: problem} : {value: {'pt-BR': pt, en}};
}
const optionalBilingual = (value, max) => {
  if (value === undefined || value === null) return {value: null};
  if (object(value) && !String(value['pt-BR'] ?? '').trim() && !String(value.en ?? '').trim()) return {value: null};
  return bilingual(value, max);
};

/** Publication key used by the public build (compact JSON, fixed insertion order). */
export function publicationKey(row) {
  const content = Object.fromEntries(['question', 'answers', 'method', 'result'].map(key => [key, {'pt-BR': row[key]['pt-BR'], en: row[key].en}]));
  return sha(JSON.stringify(content));
}
const completePublicTest = row => object(row) && ['question', 'answers', 'method', 'result'].every(key => object(row[key]) && typeof row[key]['pt-BR'] === 'string' && typeof row[key].en === 'string');

/** Published reviewed catalog (the static atlas-public.json) → selectable rows. */
export function catalogCandidates(payload) {
  if (!object(payload) || payload.contract !== 'ATLAS_PUBLIC_V1' || !Array.isArray(payload.tests)) throw new Error('PUBLIC_CATALOG_INVALID');
  const seen = new Set();
  return payload.tests.filter(completePublicTest).flatMap(row => {
    const key = publicationKey(row);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{key, question: {'pt-BR': row.question['pt-BR'], en: row.question.en}, published_at: typeof row.published_at === 'string' ? row.published_at : null}];
  });
}

/** SHADOW RESULTADOS row → stable identity and V1 digest of the bounded projected row. */
export const towerRowId = row => `r-${sha([row.data, row.task, row.item, row.titulo].map(value => String(value ?? '')).join('\u001f')).slice(0, 24)}`;
export const frontId = row => `front-${sha(String(row.item ?? row.titulo ?? '')).slice(0, 16)}`;
export const sourceDigest = row => `sha256:${sha(JSON.stringify(stable(row)))}`;

// Draft text for the public page. Machine cells (run IDs, pipe-separated codes, JSON) are
// left out so the editor starts from reader-facing text; the source row stays untouched.
const looksLikeId = v => { const s = String(v ?? '').trim(); return s.length > 0 && !/\s/.test(s) && (/^[0-9a-f]{16,}[-_]/i.test(s) || (s.length > 28 && /[-_|]/.test(s))); };
const looksLikeCode = v => { const s = String(v ?? '').trim(); if (!s || /\s[a-zà-ú]{3,}\s/.test(s)) return false; const letters = s.replace(/[^A-Za-z]/g, ''); return /[|_]/.test(s) && letters.length > 0 && letters.replace(/[^A-Z]/g, '').length / letters.length > .7; };
const looksLikeJson = v => String(v ?? '').trim().startsWith('{');
export function towerDraft(row) {
  const resultado = String(row.resultado ?? '').trim(), plain = resultado && !looksLikeCode(resultado) && !looksLikeJson(resultado);
  const m = plain ? /^(.+?\?)(\s+|$)([\s\S]*)$/.exec(resultado) : null;
  const question = m ? m[1] : (looksLikeId(row.titulo) || looksLikeCode(row.titulo) ? '' : String(row.titulo ?? ''));
  const result = [plain ? (m ? m[3].trim() : resultado) : '', looksLikeJson(row.numeros) || looksLikeCode(row.numeros) ? '' : String(row.numeros ?? '')].filter(Boolean).join(' ');
  return {question: {'pt-BR': question, en: ''}, answers: {'pt-BR': looksLikeCode(row.limites) ? '' : String(row.limites ?? ''), en: ''}, method: {'pt-BR': looksLikeCode(row.metodo) ? '' : String(row.metodo ?? ''), en: ''}, result: {'pt-BR': result, en: ''}};
}

export function towerCandidates(board) {
  const seen = new Set();
  return (board?.resultados ?? []).flatMap(row => {
    const id = towerRowId(row);
    if (seen.has(id)) return [];
    seen.add(id);
    return [{id, digest: sourceDigest(row), source: row,
      draft: towerDraft(row)}];
  });
}
export function campaignCandidates(board) {
  const seen = new Set();
  return (board?.roadmap ?? []).flatMap(row => {
    const id = frontId(row);
    if (seen.has(id) || !(row.item || row.titulo)) return [];
    seen.add(id);
    return [{id, digest: sourceDigest(row), source: row,
      draft: {question: {'pt-BR': row.titulo ?? '', en: ''}, why: {'pt-BR': '', en: ''}, currentStage: {'pt-BR': row.status ?? '', en: ''}, nextStep: {'pt-BR': row.proximo_teste ?? '', en: ''}}}];
  });
}

export const emptySelection = () => ({contract: SELECTION_CONTRACT, version: 0, updatedAt: null, catalog: [], tower: [], campaigns: []});

const iso = value => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const key64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const rowIdOk = value => typeof value === 'string' && /^r-[a-f0-9]{24}$/.test(value);
const frontIdOk = value => typeof value === 'string' && /^front-[a-f0-9]{16}$/.test(value);
const digestOk = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);

/** Strict reader for the stored document. Anything unexpected fails closed. */
export function readSelection(value) {
  if (value === null || value === undefined) return null;
  if (!object(value) || value.contract !== SELECTION_CONTRACT || !Number.isSafeInteger(value.version) || value.version < 1
    || !Array.isArray(value.catalog) || !Array.isArray(value.tower) || !Array.isArray(value.campaigns)) throw new Error('SELECTION_INVALID');
  if (value.catalog.length > LIMITS.catalog || value.tower.length > LIMITS.tower || value.campaigns.length > LIMITS.campaigns) throw new Error('SELECTION_INVALID');
  if (!value.catalog.every(key64) || new Set(value.catalog).size !== value.catalog.length) throw new Error('SELECTION_INVALID');
  const tower = value.tower.map(item => {
    if (!object(item) || !rowIdOk(item.id) || !digestOk(item.digest) || !iso(item.approvedAt)) throw new Error('SELECTION_INVALID');
    const fields = Object.fromEntries(['question', 'answers', 'method', 'result'].map(key => [key, bilingual(item.public?.[key])]));
    if (Object.values(fields).some(field => field.error)) throw new Error('SELECTION_INVALID');
    return {id: item.id, digest: item.digest, approvedAt: iso(item.approvedAt), public: Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]))};
  });
  const campaigns = value.campaigns.map(item => {
    if (!object(item) || !frontIdOk(item.id) || !digestOk(item.digest) || !iso(item.approvedAt) || !['ongoing', 'completed'].includes(item.state)) throw new Error('SELECTION_INVALID');
    const question = bilingual(item.public?.question, LIMITS.title), why = optionalBilingual(item.public?.why), currentStage = optionalBilingual(item.public?.currentStage, LIMITS.title), nextStep = optionalBilingual(item.public?.nextStep), closure = optionalBilingual(item.public?.closure);
    if ([question, why, currentStage, nextStep, closure].some(field => field.error) || (item.state === 'completed' && !closure.value)) throw new Error('SELECTION_INVALID');
    return {id: item.id, digest: item.digest, approvedAt: iso(item.approvedAt), state: item.state, public: {question: question.value, why: why.value, currentStage: currentStage.value, nextStep: nextStep.value, closure: closure.value}};
  });
  return {contract: SELECTION_CONTRACT, version: value.version, updatedAt: iso(value.updatedAt), catalog: [...value.catalog], tower, campaigns};
}

/**
 * Validates an owner request against the current candidates. Digests come from the
 * server's own source read, never from the client. An item whose source row is not
 * readable right now may be kept only unchanged (same text) from the previous document.
 * @returns {{selection?: object, errors: Array<{kind: string, id: string, field?: string, code: string}>}}
 */
export function buildSelection(body, {previous, catalog, tower, campaigns, now = new Date()}) {
  const errors = [];
  if (!object(body)) return {errors: [{kind: 'request', id: '', code: 'INVALID'}]};
  const prev = previous ?? emptySelection();
  const at = now.toISOString();
  const catalogKeys = new Set((catalog ?? []).map(row => row.key));
  const keys = Array.isArray(body.catalog) ? body.catalog : null;
  if (!keys || keys.length > LIMITS.catalog) errors.push({kind: 'catalog', id: '', code: 'INVALID'});
  const chosenCatalog = [];
  for (const key of keys ?? []) {
    if (!key64(key)) { errors.push({kind: 'catalog', id: String(key).slice(0, 80), code: 'INVALID'}); continue; }
    // A catalog row that left the published catalog can stay selected (the public client simply
    // cannot match it); a key never published cannot be added.
    if (!catalogKeys.has(key) && !prev.catalog.includes(key)) { errors.push({kind: 'catalog', id: key, code: 'NOT_IN_CATALOG'}); continue; }
    if (!chosenCatalog.includes(key)) chosenCatalog.push(key);
  }
  const sameText = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  const pick = (kind, list, limit, sources, idOk, fieldsOf) => {
    if (!Array.isArray(list) || list.length > limit) { errors.push({kind, id: '', code: 'INVALID'}); return []; }
    const bySource = new Map((sources ?? []).map(candidate => [candidate.id, candidate]));
    const before = new Map(prev[kind].map(item => [item.id, item]));
    const out = [], seen = new Set();
    for (const item of list) {
      if (!object(item) || !idOk(item.id) || seen.has(item.id)) { errors.push({kind, id: String(item?.id ?? '').slice(0, 80), code: 'INVALID'}); continue; }
      seen.add(item.id);
      const fields = fieldsOf(item);
      const bad = Object.entries(fields.parsed).filter(([, field]) => field.error);
      if (bad.length) { for (const [field, value] of bad) errors.push({kind, id: item.id, field, code: value.error}); continue; }
      if (fields.extraError) { errors.push({kind, id: item.id, code: fields.extraError}); continue; }
      const text = Object.fromEntries(Object.entries(fields.parsed).map(([field, value]) => [field, value.value]));
      const source = bySource.get(item.id), old = before.get(item.id);
      const unchanged = old && sameText(old.public, text) && (kind !== 'campaigns' || old.state === fields.state);
      if (source) out.push({id: item.id, digest: unchanged ? old.digest : source.digest, approvedAt: unchanged ? old.approvedAt : at, ...(kind === 'campaigns' ? {state: fields.state} : {}), public: text});
      else if (unchanged) out.push(old); // source not readable now: keep exactly what was approved before
      else errors.push({kind, id: item.id, code: sources ? 'SOURCE_ROW_NOT_FOUND' : 'SOURCE_UNAVAILABLE'});
    }
    return out;
  };
  const chosenTower = pick('tower', body.tower ?? [], LIMITS.tower, tower, rowIdOk, item => ({parsed: Object.fromEntries(['question', 'answers', 'method', 'result'].map(key => [key, bilingual(item.public?.[key])]))}));
  const chosenCampaigns = pick('campaigns', body.campaigns ?? [], LIMITS.campaigns, campaigns, frontIdOk, item => {
    const state = item.state === 'completed' ? 'completed' : 'ongoing';
    const parsed = {question: bilingual(item.public?.question, LIMITS.title), why: optionalBilingual(item.public?.why), currentStage: optionalBilingual(item.public?.currentStage, LIMITS.title), nextStep: optionalBilingual(item.public?.nextStep), closure: optionalBilingual(item.public?.closure)};
    return {state, parsed, extraError: state === 'completed' && !parsed.closure.value && !parsed.closure.error ? 'CLOSURE_REQUIRED' : null};
  });
  if (errors.length) return {errors};
  return {errors, selection: {contract: SELECTION_CONTRACT, version: prev.version + 1, updatedAt: at, catalog: chosenCatalog, tower: chosenTower, campaigns: chosenCampaigns}};
}

/** Short, content-free audit line: counts and which identities entered or left. */
export function auditEntry(previous, next) {
  const prev = previous ?? emptySelection();
  const diff = (a, b) => ({added: b.filter(x => !a.includes(x)).length, removed: a.filter(x => !b.includes(x)).length});
  const ids = list => list.map(item => item.id);
  return {at: next.updatedAt, version: next.version,
    catalog: {count: next.catalog.length, ...diff(prev.catalog, next.catalog)},
    tower: {count: next.tower.length, ...diff(ids(prev.tower), ids(next.tower))},
    campaigns: {count: next.campaigns.length, ...diff(ids(prev.campaigns), ids(next.campaigns))}};
}

/** Source drift of what is published: CHANGED (row differs from what was approved) or MISSING (row not in the current read). */
export function selectionDrift(selection, {tower, campaigns}) {
  if (!selection) return [];
  const check = (kind, items, sources) => sources ? items.flatMap(item => {
    const source = sources.find(candidate => candidate.id === item.id);
    return !source ? [{kind, id: item.id, status: 'MISSING'}] : source.digest !== item.digest ? [{kind, id: item.id, status: 'CHANGED'}] : [];
  }) : [];
  return [...check('tower', selection.tower, tower), ...check('campaigns', selection.campaigns, campaigns)];
}

/** Public projection: approved text only; no digest, source row, identifier of the Tower or audit data. */
export function publicSelection(selection) {
  if (!selection) return {contract: PUBLIC_SELECTION_CONTRACT, mode: 'UNSET'};
  const clean = readSelection(selection);
  return {
    contract: PUBLIC_SELECTION_CONTRACT, mode: 'LIVE', version: clean.version, updatedAt: clean.updatedAt,
    include: clean.catalog,
    tests: clean.tower.map(item => ({...item.public, published_at: item.approvedAt, updated_at: null})),
    campaignsContract: 'ATLAS_PUBLIC_CAMPAIGNS_V1',
    campaigns: clean.campaigns.map(item => ({
      id: item.id, questionId: item.id, question: item.public.question, why: item.public.why, method: null,
      currentStage: item.public.currentStage, nextStep: item.public.nextStep, limitations: null,
      updatedAt: item.approvedAt, state: item.state,
      closure: item.state === 'completed' ? {closedAt: item.approvedAt, reason: 'OTHER', outcome: null, summary: item.public.closure} : null,
      tests: [], testsCoverage: 'PARTIAL',
    })),
  };
}
