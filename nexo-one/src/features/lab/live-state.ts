import type { ActivityEvent, Lab, TestEntity, Verdict } from './model.ts';

export interface TestReading { status: string | null; verdict: Verdict; blocker: string | null; meaning: string | null }
export interface PublishedChange { id: string; name: string; kind: 'added' | 'review' | 'execution' | 'dependency' | 'evidence'; before?: string; after: string }
export const captureReading = (lab: Lab) => new Map([...lab.tests.values()].map(t => [t.id, { status: t.status, verdict: t.verdict, blocker: t.blocker, meaning: t.meaning }]));
/** Compare only public facts. Missing rows never become invented deletion events. */
export function publishedChanges(previous: Map<string, TestReading>, lab: Lab): PublishedChange[] {
  const changes: PublishedChange[] = [];
  for (const t of lab.tests.values()) {
    const before = previous.get(t.id);
    if (!before) changes.push({ id: t.id, name: t.name, kind: 'added', after: t.verdict });
    else if (before.verdict !== t.verdict) changes.push({ id: t.id, name: t.name, kind: 'review', before: before.verdict, after: t.verdict });
    else if (before.status !== t.status) changes.push({ id: t.id, name: t.name, kind: 'execution', before: before.status ?? 'não publicado', after: t.status ?? 'não publicado' });
    else if (before.blocker !== t.blocker) changes.push({ id: t.id, name: t.name, kind: 'dependency', before: before.blocker ?? undefined, after: t.blocker ?? 'Bloqueio deixou de constar nesta leitura' });
    else if (before.meaning !== t.meaning) changes.push({ id: t.id, name: t.name, kind: 'evidence', after: 'Interpretação publicada atualizada' });
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
  const test = lab.tests.get(id);
  if (test) return [test.contestOf ?? test.id, ...test.contests];
  return lab.hypotheses.get(id)?.tests ?? lab.campaigns.get(id)?.tests ?? [id];
}

export const executionStart = (test: TestEntity): string | null => test.execution?.at ?? null;
