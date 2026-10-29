// Read-only navigation and presentation over the existing Lab and SystemState.
import type {SystemState} from '../contracts/system.ts';
import type {Lab, TestEntity} from '../features/lab/model.ts';
import {hasPublishedValue, matchesSearch} from '../features/lab/presentation.ts';
import {normDomain} from '../features/lab/domains.ts';
import {domainAliases, retiredRecord} from '../shared/domain-identity.mjs';

export type ResearchFilter = 'all' | 'results' | 'pending';
export type WorkspaceRoute = {page: 'web' | 'organogram' | 'cosmos'} | {page: 'domains'} | {page: 'research'; domain: string | null; filter: ResearchFilter} | {page: 'test'; id: string} | {page: 'operations'} | {page: 'memory'} | {page: 'board'} | {page: 'continuity'} | {page: 'missing'};
export function workspaceRoute(hash: string): WorkspaceRoute | null {
  if (!hash || hash === '#' || hash === '#/' || hash === '#/teia' || hash === '#/teia/') return {page: 'web'};
  if (!/^#\/teia(?:\/|\?|$)/.test(hash)) return null;
  const [path, query = ''] = hash.slice(1).split('?');
  const parts = path!.split('/').filter(Boolean);
  const tab = new URLSearchParams(query).get('view');
  const filter: ResearchFilter = tab === 'results' || tab === 'pending' ? tab : 'all';
  try {
    if (parts.length === 1) return {page: 'web'};
    if (parts[1] === 'cosmos' && parts.length === 2) return {page: 'cosmos'};
    if (parts[1] === 'organograma' && parts.length === 2) return {page: 'organogram'};
    if (parts[1] === 'dominios' && parts.length === 2) return {page: 'domains'};
    if (parts[1] === 'testes' && parts.length === 2) return {page: 'research', domain: null, filter};
    if (parts[1] === 'dominio' && parts.length === 3 && parts[2]) return {page: 'research', domain: normDomain(decodeURIComponent(parts[2])), filter};
    if (parts[1] === 'teste' && parts.length === 3 && parts[2]) return {page: 'test', id: decodeURIComponent(parts[2])};
    if (parts[1] === 'operacao' && parts.length === 2) return {page: 'operations'};
    if (parts[1] === 'mural' && parts.length === 2) return {page: 'board'};
    if (parts[1] === 'memoria' && parts.length === 2) return {page: 'memory'};
    if (parts[1] === 'continuidade' && parts.length === 2) return {page: 'continuity'};
  } catch { /* malformed route stays inside the private shell */ }
  return {page: 'missing'};
}
export const testHref = (id: string) => `#/teia/teste/${encodeURIComponent(id)}`;
export const researchHref = (domain: string | null = null, filter: ResearchFilter = 'all') => `${domain === null ? '#/teia/testes' : `#/teia/dominio/${encodeURIComponent(domain)}`}${filter === 'all' ? '' : `?view=${filter}`}`;
export function hasTestResult(test: TestEntity): boolean {
  return hasPublishedValue(test.result) || Boolean(test.meaning?.trim()) || Boolean(test.verdictRaw && /^(SUPPORTS|NULL|FALSIFIES|INCONCLUSIVE|INCONCLUSIVO|PROMOTED|SUPPORTED|REJECTED|FALSIFIED|CONFIRMED|REFUTED|PROVISIONAL)$/i.test(test.verdictRaw));
}
export function hasTestPending(test: TestEntity): boolean {
  return /^(READY|QUEUED|DISPATCHED|RUNNING|CHECKPOINTED|PAUSED|WAIT_DEPENDENCY|AWAITING_HUMAN|BLOCKED(?:_.*)?)$/.test(test.status ?? '')
    || /^(PENDING_REVIEW|CONTESTED|REFEREE1_PASSED|REVIEW)$/.test(test.review ?? '') || test.readiness?.eligible === false || Boolean(test.blocker);
}
export type SurfaceEvidence = {owner: string; surface: string; source_value: string; path: string | null; field: string; source_revision: string; source_ref: string};
export type DomainEntry = {id: string; navigation_redirect?: {to: string; basis: string; evidence?: SurfaceEvidence[]} | null; navigation_surfaces?: string[]; observed_aliases: string[]; parents: Array<{parent: string; child: string; basis: string; path: string | null}>; counts: {entities: number; direct_tests: number; inherited_tests: number; retired_tests: number}; members: Array<{id: string; canonical_id: string; kind: string; historical: boolean; traces: Array<{basis: string; source_value?: string; path?: string}>}>};
export function domainCatalog(state?: SystemState): DomainEntry[] {
  const catalog = (state as unknown as {domain_catalog?: {contract: string; source_revision: string; domains: DomainEntry[]}})?.domain_catalog;
  // A stale cached catalog must never classify a newer source generation.
  return catalog?.contract === 'ATLAS_PRIVATE_DOMAIN_CATALOG_V1' && catalog.source_revision === state?.bus?.fingerprint && Array.isArray(catalog.domains) ? catalog.domains : [];
}
/** Empty reference-only surface aliases may resolve for navigation only. */
export function navigationDomain(domain: string, state?: SystemState): string {
  const id = normDomain(domain), catalog = domainCatalog(state), entry = catalog.find(row=>row.id === id);
  return entry?.navigation_redirect?.basis === 'EMPTY_REFERENCE_SURFACE' && !entry.members.length && catalog.some(row=>row.id === entry.navigation_redirect?.to && !row.navigation_redirect) ? entry.navigation_redirect.to : id;
}
export function navigationAliases(domain: string, state?: SystemState): string[] {
  const entry = domainCatalog(state).find(row=>row.id === navigationDomain(domain,state));
  return [...domainAliases(domain),...(entry?.navigation_surfaces ?? []).flatMap(domainAliases)];
}
export function uniqueTests(tests: readonly TestEntity[]): TestEntity[] {
  const seen = new Set<string>();
  return tests.filter(test => typeof test?.id === 'string' && test.id.trim() && !test.historical && !seen.has(test.id) && Boolean(seen.add(test.id)));
}
export function domainTestIndex(tests: readonly TestEntity[], state?: SystemState): Map<string, TestEntity[]> {
  const rows = uniqueTests(tests), byId = new Map(rows.map(test => [test.id, test])), index = new Map<string, TestEntity[]>();
  const catalog = domainCatalog(state);
  if (catalog.length) {
    for (const entry of catalog.filter(row=>navigationDomain(row.id,state) === row.id)) index.set(entry.id, [...new Set(entry.members.filter(member => member.kind === 'TEST' && !member.historical).map(member => member.canonical_id))].flatMap(id => byId.has(id) ? [byId.get(id)!] : []));
  } else {
    // Legacy payloads have no proved hierarchy; group direct declarations only.
    for (const test of rows) { const domain = normDomain(test.domain), members = index.get(domain) ?? []; members.push(test); index.set(domain,members); }
    for (const lane of state?.lanes ?? []) if (!index.has(normDomain(lane.domain))) index.set(normDomain(lane.domain),[]);
  }
  return index;
}
export function filterTests(tests: readonly TestEntity[], domain: string | null, filter: ResearchFilter, query = '', state?: SystemState): TestEntity[] {
  const rows = domain === null ? uniqueTests(tests) : domainTestIndex(tests,state).get(navigationDomain(domain,state)) ?? [];
  const aliasesByTest = new Map<string,string[]>();
  if (query.trim()) for (const [id,members] of domainTestIndex(tests,state)) for (const test of members) aliasesByTest.set(test.id,[...(aliasesByTest.get(test.id) ?? []),...navigationAliases(id,state)]);
  return rows.filter(test => (filter === 'all' || (filter === 'results' ? hasTestResult(test) : hasTestPending(test)))
    && matchesSearch(query, test.name, test.id, test.question, ...domainAliases(test.domain), ...(aliasesByTest.get(test.id) ?? []), test.subdomainId, test.topicId, test.subdomain, test.topic, test.campaignId, test.hypothesisId))
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id) || a.id.localeCompare(b.id));
}
export function domainSummary(tests: readonly TestEntity[], state: SystemState) {
  return [...domainTestIndex(tests,state)].sort(([a],[b])=>a.localeCompare(b)).map(([domain,rows]) => ({domain, tests: rows.length, results: rows.filter(hasTestResult).length, pending: rows.filter(hasTestPending).length}));
}
export function canonicalTestRecord(state: SystemState, id: string): Record<string, unknown> | null {
  const source = (state as unknown as {read_model?: {tests?: Record<string, unknown>}}).read_model?.tests?.[id];
  return source !== null && typeof source === 'object' && !Array.isArray(source) ? source as Record<string, unknown> : null;
}
export function evidenceValue(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (Object.hasOwn(record, 'value') && (Object.hasOwn(record, 'unavailable_reason') || Object.hasOwn(record, 'source_ref') || Object.hasOwn(record, 'fingerprint'))) return evidenceValue(record.value);
    return Object.fromEntries(Object.entries(record).filter(([key]) => !['source_ref', 'fingerprint', 'unavailable_reason', 'provenance'].includes(key)).map(([key, entry]) => [key, evidenceValue(entry)]));
  }
  return Array.isArray(value) ? value.map(evidenceValue) : value;
}
export function displayValue(value: unknown): string | null {
  const clean = evidenceValue(value);
  if (!hasPublishedValue(clean)) return null;
  return typeof clean === 'string' ? clean : JSON.stringify(clean, null, 2);
}

export type OperationGroup = 'running' | 'blocked' | 'waiting' | 'human';
export type OperationOption = {id: string; label: string; consequence: string | null};
export type OperationRequirement = {id: string; label: string; detail: string | null; state: string | null};
export type OperationRow = {id: string; source: 'work' | 'run' | 'decision'; domain: string; title: string; status: string; groups: OperationGroup[]; reason: string | null; next: string | null; question: string | null; sourceRef: string | null;
  /** only what the source record carries; empty arrays and nulls mean the source is silent */
  options: OperationOption[]; humanNeeds: OperationRequirement[]; automaticNeeds: OperationRequirement[]; dueAt: string | null; since: string | null; where: string | null};
const extras = {options: [] as OperationOption[], humanNeeds: [] as OperationRequirement[], automaticNeeds: [] as OperationRequirement[], dueAt: null as string | null, since: null as string | null, where: null as string | null};
const optionsOf = (list: unknown): OperationOption[] => Array.isArray(list) ? list.flatMap(item => { const o = item as {id?: unknown; label?: unknown; consequence?: unknown}; return text(o?.label) ? [{id: String(o.id ?? o.label), label: String(o.label), consequence: text(o.consequence)}] : []; }) : [];
const needsOf = (list: unknown): OperationRequirement[] => Array.isArray(list) ? list.flatMap(item => { const o = item as {id?: unknown; label?: unknown; detail?: unknown; state?: unknown}; return text(o?.label) ? [{id: String(o.id ?? o.label), label: String(o.label), detail: text(o.detail), state: text(o.state)}] : []; }) : [];
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
const groupsOf = (status: string, human: boolean): OperationGroup[] => [
  ...(/^(RUNNING|IN_PROGRESS)$/.test(status) ? ['running' as const] : []),
  ...(/^BLOCKED(?:_|$)/.test(status) ? ['blocked' as const] : []),
  ...(/^(WAIT_DEPENDENCY|WAITING_SIDE_QUEST|WAITING|QUEUED|DISPATCHED|CHECKPOINTED|PAUSED)$/.test(status) ? ['waiting' as const] : []),
  ...(human ? ['human' as const] : []),
];
export function operationRows(state: SystemState): OperationRow[] {
  const rows: OperationRow[] = [], workIds = new Set<string>();
  for (const action of state.actions) {
    const canonical = action as unknown as {id?: unknown; canonical_status?: unknown};
    const id = action.action_id; workIds.add(id); if (text(canonical.id)) workIds.add(String(canonical.id));
    const status = text(canonical.canonical_status) ?? action.status;
    rows.push({id, source:'work', domain:normDomain(action.lane), title:action.title, status, groups:groupsOf(status, Boolean(action.human_gate)), reason:text(action.blocker), next:text(action.next_action), question:text(action.human_gate?.question), sourceRef:text(action.source_ref), ...extras, options:optionsOf(action.human_gate?.options), dueAt:text(action.human_gate?.due_at)});
  }
  for (const work of state.projected_work ?? state.graph.nodes.filter(node => node.type === 'ACTION')) {
    const id = work.id.replace(/^work:/, ''); if (workIds.has(id)) continue;
    workIds.add(id); const status = work.operational_status ?? 'UNKNOWN';
    rows.push({id, source:'work', domain:normDomain(work.domain), title:work.label, status, groups:groupsOf(status, work.human_gate === true || work.decision_required === true), reason:text(work.blocker), next:null, question:null, sourceRef:text(work.source_ref), ...extras, since:text(work.blocked_since)});
  }
  const inboxActions = new Set(state.inbox.map(item => item.action_id).filter(Boolean));
  // An explicit inbox record supplies the actual question; don't count its linked work twice as a decision.
  for (const row of rows) if (inboxActions.has(row.id)) row.groups = row.groups.filter(group => group !== 'human');
  for (const item of state.inbox) rows.push({id:item.id, source:'decision', domain:normDomain(item.domain), title:item.title, status:'AWAITING_HUMAN', groups:['human'], reason:text(item.why), next:text(item.system_next), question:text(item.question), sourceRef:text(item.source_ref), ...extras, options:optionsOf(item.options), humanNeeds:needsOf(item.human_requirements), automaticNeeds:needsOf(item.automatic_requirements), dueAt:text(item.due_at), where:text(item.action_location)});
  for (const run of state.runs) {
    if (run.status !== 'RUNNING' || rows.some(row => row.id === run.action_id && row.groups.includes('running'))) continue;
    rows.push({id:run.run_id, source:'run', domain:normDomain(run.lane), title:run.title, status:run.status, groups:['running'], reason:null, next:null, question:null, sourceRef:text(run.receipt_ref), ...extras, since:text(run.started_at)});
  }
  return rows.filter(row => row.groups.length).sort((a,b) => a.domain.localeCompare(b.domain) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

// ---- Coverage: absent is not zero, partial is not complete ----
export type Coverage = 'complete' | 'partial' | 'unavailable' | 'undeclared';
/** What the source says about a collection. "undeclared" = the reading carries no availability record for it (nothing is assumed). */
export function coverageOf(state: SystemState, collection: 'tests' | 'work'): Coverage {
  const entry = (state as unknown as {availability?: Record<string, {state?: unknown}>}).availability?.[collection]?.state;
  return entry === 'UNAVAILABLE' ? 'unavailable' : entry === 'PARTIAL' ? 'partial' : entry === 'AVAILABLE' || entry === 'COMPLETE' ? 'complete' : 'undeclared';
}

// ---- Dates: only what parses; the published string is kept for the technical detail ----
export function dateParts(value: unknown, lang: string): {iso: string; label: string} | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const at = Date.parse(value); if (!Number.isFinite(at)) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  try { return {iso: value.trim(), label: new Intl.DateTimeFormat(lang, dateOnly ? {dateStyle: 'long', timeZone: 'UTC'} : {dateStyle: 'long', timeStyle: 'short'}).format(at)}; } catch { return {iso: value.trim(), label: value.trim()}; }
}

// ---- Domain outline: domain, subdomain, topic, campaign and hypothesis are different relations ----
export type OutlineTopic = {key: string; label: string; named: boolean; tests: number};
export type OutlineSubdomain = {key: string; label: string; named: boolean; tests: number; topics: OutlineTopic[]};
export type OutlineCampaign = {id: string; title: string | null; question: string | null; why: string | null; tests: number};
export type OutlineHypothesis = {id: string; statement: string | null; tests: number};
export type DomainOutline = {
  domain: string;
  aliases: string[]; surfaces: string[]; surfaceEvidence: SurfaceEvidence[]; parents: string[]; entities: number | null; directTests: number; inheritedTests: number; retiredTests: number;
  /** text the projection attaches to the domain node; null when it attaches none */
  description: string | null;
  lane: {current: string | null; next: string | null; blockers: string[]} | null;
  subdomains: OutlineSubdomain[];
  /** tests of this domain whose record names no subdomain */
  withoutSubdomain: number;
  /** campaigns / hypotheses that have at least one test in this domain (derived from the test records) */
  campaigns: OutlineCampaign[]; hypotheses: OutlineHypothesis[];
  tests: number; results: number; pending: number;
};
export function domainOutline(tests: readonly TestEntity[], lab: Pick<Lab, 'campaigns' | 'hypotheses'>, state: SystemState, domain: string, index = domainTestIndex(tests,state)): DomainOutline {
  domain = navigationDomain(domain,state);
  const rows = index.get(domain) ?? [], catalog = domainCatalog(state).find(entry => entry.id === domain);
  const subs = new Map<string, OutlineSubdomain & {topicMap: Map<string, OutlineTopic>}>(); let withoutSubdomain = 0;
  const campaigns = new Map<string, number>(), hypotheses = new Map<string, number>();
  for (const test of rows) {
    const label = text(test.subdomain), key = text(test.subdomainId) ?? label;
    if (key) {
      const sub = subs.get(key) ?? {key, label: label ?? key, named: Boolean(label), tests: 0, topics: [], topicMap: new Map<string, OutlineTopic>()};
      sub.tests += 1;
      const topic = text(test.topic), topicKey = text(test.topicId) ?? topic;
      if (topicKey) { const row = sub.topicMap.get(topicKey) ?? {key: topicKey, label: topic ?? topicKey, named: Boolean(topic), tests: 0}; row.tests += 1; sub.topicMap.set(topicKey, row); }
      subs.set(key, sub);
    } else withoutSubdomain += 1;
    if (test.campaignId) campaigns.set(test.campaignId, (campaigns.get(test.campaignId) ?? 0) + 1);
    if (test.hypothesisId) hypotheses.set(test.hypothesisId, (hypotheses.get(test.hypothesisId) ?? 0) + 1);
  }
  const node = state.graph.nodes.find(item => item.type === 'DOMAIN' && normDomain(item.domain) === domain);
  const lane = state.lanes.find(item => normDomain(item.domain) === domain);
  return {
    domain, surfaces: catalog?.navigation_surfaces ?? [], surfaceEvidence: domainCatalog(state).filter(entry=>entry.navigation_redirect?.to === domain).flatMap(entry=>entry.navigation_redirect?.evidence ?? []), entities: catalog?.counts.entities ?? null, aliases: catalog?.observed_aliases ?? [], parents: [...new Set(catalog?.parents.map(parent => parent.parent) ?? [])], directTests: catalog?.counts.direct_tests ?? rows.length, inheritedTests: catalog?.counts.inherited_tests ?? 0, retiredTests: rows.filter(retiredRecord).length, description: text(node?.semantic_description) ?? text(node?.summary),
    lane: lane && !catalog?.counts.inherited_tests ? {current: text(lane.current_state), next: text(lane.next_action), blockers: (lane.blockers ?? []).filter(item => typeof item === 'string' && item.trim())} : null,
    subdomains: [...subs.values()].map(({topicMap, ...sub}) => ({...sub, topics: [...topicMap.values()].sort((a, b) => a.label.localeCompare(b.label))})).sort((a, b) => a.label.localeCompare(b.label)),
    withoutSubdomain,
    campaigns: [...campaigns].map(([id, count]) => { const c = lab.campaigns.get(id); return {id, title: c?.title ?? null, question: c?.questionPlain ?? c?.question ?? null, why: c?.why ?? null, tests: count}; }).sort((a, b) => (a.title ?? a.id).localeCompare(b.title ?? b.id)),
    hypotheses: [...hypotheses].map(([id, count]) => ({id, statement: lab.hypotheses.get(id)?.statement ?? null, tests: count})).sort((a, b) => a.id.localeCompare(b.id)),
    tests: rows.length, results: rows.filter(hasTestResult).length, pending: rows.filter(hasTestPending).length,
  };
}

// ---- Relations of one test: only links the source carries ----
export type TestLink = {id: string; name: string | null; present: boolean};
export type GraphRelation = {key: string; kind: string; direction: 'out' | 'in'; otherId: string; otherLabel: string | null; otherType: string | null; explanation: string | null};
export type TestRelations = {
  campaign: {id: string; title: string | null; question: string | null} | null;
  hypothesis: {id: string; statement: string | null} | null;
  roadmap: {id: string; title: string | null} | null;
  dependsOn: TestLink[]; requiredBy: TestLink[]; contestOf: TestLink | null; contestedBy: TestLink[];
  graph: GraphRelation[];
};
const bareId = (id: string) => id.replace(/^(?:test|hypothesis|campaign|roadmap|work):/i, '');
export function testRelations(test: TestEntity, lab: Pick<Lab, 'tests' | 'campaigns' | 'hypotheses' | 'roadmaps'> & {historicalTests?: Lab['historicalTests']}, state: SystemState): TestRelations {
  const link = (raw: string): TestLink => { const id = bareId(raw), found = lab.tests.get(id) ?? lab.historicalTests?.get(id); return {id, name: found?.name ?? null, present: lab.tests.has(id)}; };
  const unique = (ids: readonly string[]) => [...new Set(ids.map(bareId))].filter(id => id && id !== test.id).map(link);
  const nodes = new Map(state.graph.nodes.map(node => [node.id, node] as const)), own = new Set([test.id, `test:${test.id}`]);
  const graph: GraphRelation[] = [];
  for (const edge of state.graph.edges) {
    const out = own.has(edge.from), into = own.has(edge.to); if (out === into) continue;
    const other = out ? edge.to : edge.from, node = nodes.get(other);
    graph.push({key: edge.id, kind: edge.kind, direction: out ? 'out' : 'in', otherId: other, otherLabel: text(node?.label), otherType: node?.type ?? null, explanation: text(edge.explanation)});
  }
  const campaign = test.campaignId ? lab.campaigns.get(test.campaignId) : undefined, hypothesis = test.hypothesisId ? lab.hypotheses.get(test.hypothesisId) : undefined, roadmap = test.roadmapId ? lab.roadmaps.get(test.roadmapId) : undefined;
  return {
    campaign: test.campaignId ? {id: test.campaignId, title: campaign?.title ?? null, question: campaign?.questionPlain ?? campaign?.question ?? null} : null,
    hypothesis: test.hypothesisId ? {id: test.hypothesisId, statement: hypothesis?.statement ?? null} : null,
    roadmap: test.roadmapId ? {id: test.roadmapId, title: roadmap?.title ?? null} : null,
    dependsOn: unique(test.parents), requiredBy: unique(test.children),
    contestOf: test.contestOf ? link(test.contestOf) : null, contestedBy: unique(test.contests),
    graph: graph.sort((a, b) => a.kind.localeCompare(b.kind) || a.otherId.localeCompare(b.otherId)).slice(0, 24),
  };
}
export const hasRelations = (r: TestRelations) => Boolean(r.campaign || r.hypothesis || r.roadmap || r.contestOf || r.dependsOn.length || r.requiredBy.length || r.contestedBy.length || r.graph.length);

/** Lanes are the source's own per-domain operational summary. */
export function laneRows(state: SystemState) {
  return state.lanes.map(lane => ({domain: normDomain(lane.domain), current: text(lane.current_state), next: text(lane.next_action), blockers: (lane.blockers ?? []).filter(item => typeof item === 'string' && item.trim()),
    sideQuests: (lane.side_quests ?? []).filter(item => text(item?.title)).map(item => ({id: item.id, title: item.title, status: item.status}))})).sort((a, b) => a.domain.localeCompare(b.domain));
}
