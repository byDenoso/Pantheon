import {createHash} from 'node:crypto';
import {publicTestSourceDigest} from './public-test-projection.mjs';

export const PUBLIC_CAMPAIGN_POLICY = 'NEXO_PUBLIC_CAMPAIGNS_V1';
export const PUBLIC_CAMPAIGN_SNAPSHOT = 'ATLAS_PUBLIC_CAMPAIGNS_V1';
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const safeId = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(v) ? v : null;
const sensitive = /(?:peer[-._ ]?detection|olympus|bearer\s+\S+|-----BEGIN .*PRIVATE KEY|(?:api[_ -]?key|password|secret|token|(?:access|refresh|id|auth|session)[_ -]?token|authorization|client[_ -]?secret|x-(?:goog|amz)-(?:signature|credential|security-token))\s*[:=]|(?:[A-Z]:\\|file:\/\/|drive:\/\/|tower(?:-live)?:\/\/|_source_path|localhost|127\.0\.0\.1))/i;
const internalPath = /(?:^|[\s('"=:\[])\/(?:tmp|home|Users|var|workspace|opt)(?:\/|$|[\s.,;:)\]"'])/i;
const authenticatedParameter = /^(?:token|(?:access|refresh|id|auth|session)[_-]?token|auth(?:orization)?|oauth[_-]?token|jwt|bearer|api[_-]?key|key|client[_-]?secret|secret|password|signature|sig|credential(?:s)?|session[_-]?id|sas[_-]?token|x-amz-.+|x-goog-.+|googleaccessid|awsaccesskeyid)$/i;
const text = v => typeof v === 'string' && v.trim() && v.length <= 4000 && !sensitive.test(v) && !internalPath.test(v) ? v : null;
const bi = v => object(v) && text(v['pt-BR']) && text(v.en) ? {'pt-BR': v['pt-BR'], en: v.en} : null;
const iso = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && v.length <= 40 && Number.isFinite(Date.parse(v)) ? v : null;
const digest = v => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v) ? v : null;
const verdicts = new Set(['SUPPORTS', 'NULL', 'FALSIFIES', 'INCONCLUSIVE']);
const closureReasons = new Set(['SUCCESS', 'KILL', 'SATURATION', 'BUDGET', 'OTHER']);
const stages = new Set(['PLANNED', 'RUNNING', 'AWAITING_REVIEW', 'REVIEWED', 'BLOCKED', 'PAUSED', 'UNKNOWN']);
const coverages = new Set(['COMPLETE', 'PARTIAL', 'UNAVAILABLE']);
const stable = v => Array.isArray(v) ? v.map(stable) : object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const hash = v => `sha256:${createHash('sha256').update(JSON.stringify(stable(v))).digest('hex')}`;
const publication = a => a?.publication?.policy === PUBLIC_CAMPAIGN_POLICY && a.publication.status === 'APPROVED' && safeId(a.publication.receiptId);
const publicSource = row => row?.visibility === 'PUBLIC' && row.private !== true && !/PRIVATE|OLYMPUS/i.test(`${row.access ?? ''} ${row.domain ?? ''} ${row.classification ?? ''}`);
const limitList = v => v === null ? null : Array.isArray(v) && v.length <= 40 && v.every(bi) ? v.map(bi) : null;
function references(v) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 20).flatMap(r => {
    if (!object(r) || r.public !== true || !bi(r.label) || typeof r.url !== 'string' || r.url.length > 2048 || sensitive.test(r.url) || internalPath.test(r.url)) return [];
    try {
      const u = new URL(r.url), authenticated = [...u.searchParams.keys(), ...new URLSearchParams(u.hash.slice(1)).keys()].some(key => authenticatedParameter.test(key));
      return u.protocol === 'https:' && !u.username && !u.password && !authenticated && !/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[::1\]|\[f[cd])/.test(u.hostname) && !/(?:drive|docs)\.google\.com$/i.test(u.hostname) ? [{label: bi(r.label), url: u.href}] : [];
    } catch { return []; }
  });
}
function unique(rows) {
  const map = new Map(), duplicates = new Set();
  for (const row of rows ?? []) { if (!object(row) || !safeId(row.id)) continue; if (map.has(row.id)) duplicates.add(row.id); map.set(row.id, row); }
  for (const id of duplicates) map.delete(id);
  return map;
}
function closed(source, presentation) {
  const c = source.closure, p = presentation.closure;
  if (!object(c) || c.status !== 'CLOSED' || !safeId(c.receipt_id) || !iso(c.closed_at) || !object(p) || !bi(p.summary)) return null;
  const reason = closureReasons.has(c.reason) ? c.reason : closureReasons.has(c.outcome) ? c.outcome : 'OTHER';
  const outcome = verdicts.has(c.outcome) ? c.outcome : verdicts.has(c.scientific_outcome) ? c.scientific_outcome : null;
  if (p.receiptId !== c.receipt_id || p.closedAt !== c.closed_at || (p.outcome ?? null) !== outcome || (p.reason !== undefined && p.reason !== reason)) return null;
  return {closedAt: c.closed_at, reason, outcome, summary: bi(p.summary)};
}
function independentlyReviewed(source, sources, approval) {
  // The trusted Writer computes the scientific predicate with scientific_integrity.independence.
  // This boundary verifies its exact source/attack binding and canonical executed review chain.
  const proof = approval.independence;
  if (!['CONFIRMED', 'REFUTED'].includes(source.review_state) || !object(proof) || proof.policy !== 'NEXO_SCIENTIFIC_INDEPENDENCE_V1' || proof.eligible !== true || proof.parentDigest !== publicTestSourceDigest(source) || !safeId(proof.attackId) || !iso(proof.reviewedAt)) return false;
  const attack = sources.get(proof.attackId);
  if (!attack || attack.contests_test_id !== source.id || proof.attackDigest !== publicTestSourceDigest(attack)) return false;
  if (Array.isArray(source.contests) && !source.contests.some(c => c.contest_test_id === attack.id)) return false;
  const mechanical = source.mechanical_contest_verdict;
  if (object(mechanical) && mechanical.contest_test_id === attack.id && mechanical.at === proof.reviewedAt && mechanical.outcome === source.review_state && ['FROZEN_INDEPENDENT_ATTACK_V2', 'FROZEN_ATTACK_CRITERION_V1'].includes(mechanical.rule)) {
    if (mechanical.rule === 'FROZEN_INDEPENDENT_ATTACK_V2' && !(source.review_validation?.policy === 'SCIENTIFIC_INTEGRITY_V1' && source.review_validation.eligible === true)) return false;
    return true;
  }
  return Array.isArray(source.reviews) && source.reviews.some(r => r.contest_test_id === attack.id && safeId(r.referee) && r.at === proof.reviewedAt && ['SURVIVED', 'SUPPORTED', 'PROMOTED', 'REJECTED', 'REFUTED', 'INCONCLUSIVE', 'INCONCLUSIVO'].includes(r.outcome));
}
function canonicalStage(row, reviewed) {
  if (reviewed) return 'REVIEWED';
  const status = String(row.status ?? row.state ?? '').toUpperCase();
  if (['BLOCKED', 'BLOCKED_INPUT', 'INPUT_UNAVAILABLE', 'REFUSED'].includes(status)) return 'BLOCKED';
  if (['PAUSED', 'ON_HOLD'].includes(status)) return 'PAUSED';
  if (['DONE', 'COMPLETED', 'RESULT', 'VERIFIED'].includes(status) && iso(row.executed_at)) return 'AWAITING_REVIEW';
  if ((status === 'RUNNING' || row.execution_phase === 'RUNNING') && row.execution_observation === 'GITHUB_JOB_STEP' && iso(row.started_at) && /^(?:https:\/\/github\.com\/byDenoso\/Pantheon\/)?actions\/runs\/[1-9][0-9]*$/.test(row.run_ref ?? '')) return 'RUNNING';
  if (['DRAFT', 'READY', 'QUEUED', 'DISPATCH_PENDING', 'DISPATCHED'].includes(status)) return 'PLANNED';
  return 'UNKNOWN';
}

/** Writer-only input. Explicit source identity and digest bind every public approval.
 * Similar question text never merges campaigns. Missing bindings remain unpublished.
 * Canonical source records and all approval receipts stay on the server.
 */
export function projectApprovedPublicCampaigns(records, approvals = [], meta = {}) {
  if (!object(records) || !Array.isArray(approvals) || !digest(meta.sourceRevision) || !iso(meta.generatedAt)) throw new Error('PUBLIC_CAMPAIGN_SOURCE_UNVERIFIED');
  const sources = unique([...(records.campaigns ?? []), ...(records.roadmaps ?? []).filter(r => !(records.campaigns ?? []).some(c => c.id === r.id))]);
  const tests = unique(records.tests);
  const usedIds = new Set(), usedQuestions = new Set(), out = [];
  for (const a of approvals.filter(a => a?.kind === 'CAMPAIGN')) {
    const source = sources.get(a.sourceId), p = a.presentation;
    if (!source || !publicSource(source) || publicTestSourceDigest(source) !== a.sourceDigest || !publication(a) || !object(p) || !safeId(a.publicId) || !safeId(a.questionId) || source.question_id !== a.questionId || usedIds.has(a.publicId) || usedQuestions.has(a.questionId) || !bi(p.question) || !iso(p.updatedAt)) continue;
    const closure = closed(source, p);
    const campaign = {id: a.publicId, questionId: a.questionId, question: bi(p.question), why: bi(p.why), method: bi(p.method), currentStage: bi(p.currentStage), nextStep: bi(p.nextStep), limitations: limitList(p.limitations), updatedAt: p.updatedAt, state: closure ? 'completed' : 'ongoing', closure, tests: [], testsCoverage: 'UNAVAILABLE', references: references(p.references)};
    const seenTests = new Set();
    for (const t of approvals.filter(t => t?.kind === 'TEST' && t.campaignSourceId === a.sourceId)) {
      const row = tests.get(t.sourceId), q = t.presentation;
      if (!row || !publicSource(row) || publicTestSourceDigest(row) !== t.sourceDigest || !publication(t) || !object(q) || !safeId(t.publicId) || seenTests.has(t.publicId) || !bi(q.question) || !iso(q.updatedAt)) continue;
      if (row.campaign_id !== source.id && row.roadmap_id !== source.id) continue;
      const reviewed = independentlyReviewed(row, tests, t);
      const unsupportedPositive = q.result?.verdict === 'SUPPORTS' && (row.review_state === 'REFUTED' || ['INCONCLUSIVE', 'INCONCLUSIVO'].includes(String(row.verdict ?? '').toUpperCase()));
      const result = reviewed && object(q.result) && verdicts.has(q.result.verdict) && !unsupportedPositive && bi(q.result.summary) ? {verdict: q.result.verdict, summary: bi(q.result.summary), limitations: limitList(q.result.limitations)} : null;
      campaign.tests.push({id: t.publicId, question: bi(q.question), method: bi(q.method), stage: canonicalStage(row, reviewed), updatedAt: q.updatedAt, result, references: references(q.references)});
      seenTests.add(t.publicId);
    }
    if (Array.isArray(records.tests)) {
      const eligible = records.tests.filter(row => publicSource(row) && (row.campaign_id === source.id || row.roadmap_id === source.id));
      const members = Array.isArray(source.test_ids) ? source.test_ids : Array.isArray(source.members) ? source.members : [];
      const unresolved = members.some(id => typeof id === 'string' && !tests.has(id));
      campaign.testsCoverage = unresolved || campaign.tests.length < eligible.length ? 'PARTIAL' : 'COMPLETE';
    }
    // A closure receipt proves the ending; its scientific label still needs
    // every linked public test reviewed with a matching published conclusion.
    if (campaign.closure?.outcome && (campaign.testsCoverage !== 'COMPLETE' || !campaign.tests.length
        || campaign.tests.some(test => test.result?.verdict !== campaign.closure.outcome))) campaign.closure.outcome = null;
    out.push(campaign); usedIds.add(a.publicId); usedQuestions.add(a.questionId);
  }
  const publicSources = [...sources.values()].filter(publicSource);
  const coverage = out.length === 0 ? 'UNAVAILABLE' : out.length < publicSources.length || out.some(c => c.testsCoverage !== 'COMPLETE') ? 'PARTIAL' : 'COMPLETE';
  return createPublicCampaignSnapshot(out, {...meta, coverage});
}

/** Revalidate an already sanitized snapshot at every publication/read boundary. */
export function createPublicCampaignSnapshot(campaigns, meta) {
  if (!Array.isArray(campaigns) || campaigns.length > 10000 || !digest(meta.sourceRevision) || !iso(meta.generatedAt)) throw new Error('PUBLIC_CAMPAIGN_SNAPSHOT_INVALID');
  const seen = new Set(), questions = new Set();
  const safe = campaigns.map(c => {
    if (!object(c) || !safeId(c.id) || !safeId(c.questionId) || seen.has(c.id) || questions.has(c.questionId) || !bi(c.question) || !iso(c.updatedAt) || !['ongoing', 'completed'].includes(c.state) || !Array.isArray(c.tests) || c.tests.length > 10000) throw new Error('PUBLIC_CAMPAIGN_SNAPSHOT_INVALID');
    seen.add(c.id); questions.add(c.questionId);
    const closure = object(c.closure) && iso(c.closure.closedAt) && (c.closure.outcome === null || verdicts.has(c.closure.outcome)) && bi(c.closure.summary) ? {closedAt: c.closure.closedAt, reason: closureReasons.has(c.closure.reason) ? c.closure.reason : 'OTHER', outcome: c.closure.outcome, summary: bi(c.closure.summary)} : null;
    if (c.state === 'completed' && !closure) throw new Error('PUBLIC_CAMPAIGN_CLOSURE_MISSING');
    const testIds = new Set();
    const tests = c.tests.map(t => {
      if (!object(t) || !safeId(t.id) || testIds.has(t.id) || !bi(t.question) || !iso(t.updatedAt) || !stages.has(t.stage)) throw new Error('PUBLIC_CAMPAIGN_SNAPSHOT_INVALID');
      testIds.add(t.id);
      const result = object(t.result) && verdicts.has(t.result.verdict) && bi(t.result.summary) ? {verdict: t.result.verdict, summary: bi(t.result.summary), limitations: limitList(t.result.limitations)} : null;
      return {id: t.id, question: bi(t.question), method: bi(t.method), stage: t.stage, updatedAt: t.updatedAt, result, references: references((t.references ?? []).map(r => ({...r, public: true})))};
    });
    return {id: c.id, questionId: c.questionId, question: bi(c.question), why: bi(c.why), method: bi(c.method), currentStage: bi(c.currentStage), nextStep: bi(c.nextStep), limitations: limitList(c.limitations), updatedAt: c.updatedAt, state: c.state, closure, tests, testsCoverage: coverages.has(c.testsCoverage) ? c.testsCoverage : 'COMPLETE', references: references((c.references ?? []).map(r => ({...r, public: true})))};
  });
  const body = {contract: PUBLIC_CAMPAIGN_SNAPSHOT, sourceRevision: meta.sourceRevision, generatedAt: meta.generatedAt, coverage: coverages.has(meta.coverage) ? meta.coverage : 'COMPLETE', campaigns: safe};
  return {...body, snapshotDigest: hash(body)};
}
export function validatePublicCampaignSnapshot(value) {
  if (value?.contract !== PUBLIC_CAMPAIGN_SNAPSHOT) throw new Error('PUBLIC_CAMPAIGN_SNAPSHOT_INVALID');
  const safe = createPublicCampaignSnapshot(value.campaigns, value);
  if (safe.snapshotDigest !== value.snapshotDigest || JSON.stringify(stable(safe)) !== JSON.stringify(stable(value))) throw new Error('PUBLIC_CAMPAIGN_SNAPSHOT_DRIFT');
  return safe;
}
