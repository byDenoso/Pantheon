// Read-only navigation and presentation over the existing Lab and SystemState.
import type {SystemState} from '../contracts/system.ts';
import type {TestEntity} from '../features/lab/model.ts';
import {hasPublishedValue, matchesSearch} from '../features/lab/presentation.ts';
import {normDomain} from '../features/lab/domains.ts';

export type ResearchFilter = 'all' | 'results' | 'pending';
export type WorkspaceRoute = {page: 'web' | 'organogram'} | {page: 'domains'} | {page: 'research'; domain: string | null; filter: ResearchFilter} | {page: 'test'; id: string} | {page: 'operations'} | {page: 'missing'};
export function workspaceRoute(hash: string): WorkspaceRoute | null {
  if (!hash || hash === '#' || hash === '#/' || hash === '#/teia' || hash === '#/teia/') return {page: 'web'};
  if (!/^#\/teia(?:\/|\?|$)/.test(hash)) return null;
  const [path, query = ''] = hash.slice(1).split('?');
  const parts = path!.split('/').filter(Boolean);
  const tab = new URLSearchParams(query).get('view');
  const filter: ResearchFilter = tab === 'results' || tab === 'pending' ? tab : 'all';
  try {
    if (parts.length === 1) return {page: 'web'};
    if (parts[1] === 'organograma' && parts.length === 2) return {page: 'organogram'};
    if (parts[1] === 'dominios' && parts.length === 2) return {page: 'domains'};
    if (parts[1] === 'testes' && parts.length === 2) return {page: 'research', domain: null, filter};
    if (parts[1] === 'dominio' && parts.length === 3 && parts[2]) return {page: 'research', domain: decodeURIComponent(parts[2]), filter};
    if (parts[1] === 'teste' && parts.length === 3 && parts[2]) return {page: 'test', id: decodeURIComponent(parts[2])};
    if (parts[1] === 'operacao' && parts.length === 2) return {page: 'operations'};
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
export function filterTests(tests: readonly TestEntity[], domain: string | null, filter: ResearchFilter, query = ''): TestEntity[] {
  return tests.filter(test => (domain === null || normDomain(test.domain) === domain)
    && (filter === 'all' || (filter === 'results' ? hasTestResult(test) : hasTestPending(test)))
    && matchesSearch(query, test.name, test.id, test.question, test.domain, test.subdomain, test.topic))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
export function domainSummary(tests: readonly TestEntity[], state: SystemState) {
  // Domains already declared by the source remain visible even if they have no tests.
  const declared = [...tests.map(test => normDomain(test.domain)), ...state.lanes.map(lane => normDomain(lane.domain)), ...state.graph.nodes.filter(node => node.type === 'DOMAIN').map(node => normDomain(node.domain))];
  return [...new Set(declared)].filter(Boolean).sort().map(domain => {
    const rows = filterTests(tests, domain, 'all');
    return {domain, tests: rows.length, results: rows.filter(hasTestResult).length, pending: rows.filter(hasTestPending).length};
  });
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
export type OperationRow = {id: string; source: 'work' | 'run' | 'decision'; domain: string; title: string; status: string; groups: OperationGroup[]; reason: string | null; next: string | null; question: string | null; sourceRef: string | null};
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
    rows.push({id, source:'work', domain:normDomain(action.lane), title:action.title, status, groups:groupsOf(status, Boolean(action.human_gate)), reason:text(action.blocker), next:text(action.next_action), question:text(action.human_gate?.question), sourceRef:text(action.source_ref)});
  }
  for (const work of state.projected_work ?? state.graph.nodes.filter(node => node.type === 'ACTION')) {
    const id = work.id.replace(/^work:/, ''); if (workIds.has(id)) continue;
    workIds.add(id); const status = work.operational_status ?? 'UNKNOWN';
    rows.push({id, source:'work', domain:normDomain(work.domain), title:work.label, status, groups:groupsOf(status, work.human_gate === true || work.decision_required === true), reason:text(work.blocker), next:null, question:null, sourceRef:text(work.source_ref)});
  }
  const inboxActions = new Set(state.inbox.map(item => item.action_id).filter(Boolean));
  // An explicit inbox record supplies the actual question; don't count its linked work twice as a decision.
  for (const row of rows) if (inboxActions.has(row.id)) row.groups = row.groups.filter(group => group !== 'human');
  for (const item of state.inbox) rows.push({id:item.id, source:'decision', domain:normDomain(item.domain), title:item.title, status:'AWAITING_HUMAN', groups:['human'], reason:text(item.why), next:text(item.system_next), question:text(item.question), sourceRef:text(item.source_ref)});
  for (const run of state.runs) {
    if (run.status !== 'RUNNING' || rows.some(row => row.id === run.action_id && row.groups.includes('running'))) continue;
    rows.push({id:run.run_id, source:'run', domain:normDomain(run.lane), title:run.title, status:run.status, groups:['running'], reason:null, next:null, question:null, sourceRef:text(run.receipt_ref)});
  }
  return rows.filter(row => row.groups.length).sort((a,b) => a.domain.localeCompare(b.domain) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}
