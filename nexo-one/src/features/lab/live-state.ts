import type { ActivityEvent, Lab, TestEntity } from './model.ts';

export interface TestReading {
  status: string | null; review: string | null; verdictRaw: string | null; blocker: string | null;
  meaning: string | null; eligible: boolean | null;
}
export interface PublishedChange { id: string; name: string; kind: 'added' | 'review' | 'execution' | 'dependency' | 'evidence' | 'readiness'; before?: string; after: string }
/** Keep previously seen records/fields across partial reads; absence is not an event. */
export function captureReading(lab: Lab, previous: Map<string, TestReading> = new Map()): Map<string, TestReading> {
  const reading = new Map(previous);
  for (const t of lab.tests.values()) {
    const before = previous.get(t.id);
    reading.set(t.id, { status: t.status ?? before?.status ?? null, review: t.review ?? before?.review ?? null,
      verdictRaw: t.verdictRaw ?? before?.verdictRaw ?? null, blocker: t.blocker ?? before?.blocker ?? null,
      meaning: t.meaning ?? before?.meaning ?? null, eligible: t.readiness?.eligible ?? before?.eligible ?? null });
  }
  return reading;
}
/** Compare explicit public fields rather than fallbacks derived from missing data. */
export function publishedChanges(previous: Map<string, TestReading>, lab: Lab): PublishedChange[] {
  const changes: PublishedChange[] = [];
  for (const t of lab.tests.values()) {
    const before = previous.get(t.id);
    if (!before) changes.push({ id: t.id, name: t.name, kind: 'added', after: t.verdict });
    else if (t.review !== null && before.review !== t.review) changes.push({ id: t.id, name: t.name, kind: 'review', before: before.review ?? 'não publicado', after: t.review });
    else if (t.status !== null && before.status !== t.status) changes.push({ id: t.id, name: t.name, kind: 'execution', before: before.status ?? 'não publicado', after: t.status });
    else if (t.readiness && before.eligible !== t.readiness.eligible) changes.push({ id: t.id, name: t.name, kind: 'readiness', after: t.readiness.eligible ? 'Elegível na verificação publicada' : 'Inelegível na verificação publicada' });
    else if (t.blocker !== null && before.blocker !== t.blocker) changes.push({ id: t.id, name: t.name, kind: 'dependency', before: before.blocker ?? undefined, after: t.blocker });
    else if (t.verdictRaw !== null && before.verdictRaw !== t.verdictRaw) changes.push({ id: t.id, name: t.name, kind: 'evidence', after: `Resultado bruto publicado: ${t.verdictRaw}` });
    else if (t.meaning !== null && before.meaning !== t.meaning) changes.push({ id: t.id, name: t.name, kind: 'evidence', after: 'Interpretação publicada atualizada' });
  }
  return changes;
}

export function executionNow(lab: Lab) {
  const all = [...lab.tests.values()];
  return {
    running: all.filter(t => t.status?.toUpperCase() === 'RUNNING'),
    dispatched: all.filter(t => t.status?.toUpperCase() === 'DISPATCHED'),
    queued: all.filter(t => t.status?.toUpperCase() === 'QUEUED'),
    ready: all.filter(t => t.status?.toUpperCase() === 'READY'),
    blocked: all.filter(t => t.verdict === 'BLOCKED'),
  };
}

const EVENT_LABELS: Record<string, string> = {
  TEST_RESULT_RECORDED: 'registrou resultado', RESULT_CONFIRMED: 'confirmou resultado', RESULT_REFUTED: 'refutou resultado',
  RESULT_CONTESTED: 'abriu contestação', RESULT_REFEREE1_PASSED: 'registrou a primeira revisão',
  HYPOTHESIS_UPSERTED: 'publicou hipótese', NEXO_THOUGHT_RECORDED: 'publicou pensamento', TEST_BATTERY_DISPATCHED: 'despachou bateria',
  ROADMAP_TEST_FROZEN: 'congelou o contrato de um teste',
};
export const eventLabel = (event: ActivityEvent): string => EVENT_LABELS[event.event_type] ?? event.event_type.toLowerCase().replace(/_/g, ' ');
export const latestDelivery = (lab: Lab, roles?: string[]): ActivityEvent | undefined => [...lab.activity].reverse().find(event => EVENT_LABELS[event.event_type] && (!roles || roles.includes(event.role.toUpperCase())));

/** Highlight real test members when a hypothesis is selected, including its reviewed targets. */
export function focusEntities(lab: Lab, id: string): string[] {
  const candidates = lab.tests.has(id) ? [id] : lab.hypotheses.get(id)?.tests ?? lab.campaigns.get(id)?.tests ?? [];
  const visible = candidates.flatMap(candidate => {
    let test = lab.tests.get(candidate);
    const visited = new Set<string>();
    while (test?.contestOf && !visited.has(test.id)) { visited.add(test.id); test = lab.tests.get(test.contestOf); }
    return test && !test.contestOf ? [test.id] : [];
  });
  return [...new Set(visible)];
}

export const executionStart = (test: TestEntity): string | null => test.execution?.at ?? null;
