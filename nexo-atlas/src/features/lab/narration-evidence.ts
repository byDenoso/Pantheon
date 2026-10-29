import { VERDICT_PT, type TestEntity } from './model.ts';

/** Current received fields, not inferred history or a claim that an event happened again. */
export function narrationEvidence(test?: TestEntity, extra: { roadmap?: string; by?: string; request?: string } = {}) {
  const fields: Record<string, string> = {};
  const add = (key: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) fields[key] = value.trim();
  };
  if (test) {
    if (test.status) add('status', VERDICT_PT[test.verdict]);
    add('review', test.review);
    add('result', test.verdictRaw);
    if (test.verdict === 'BLOCKED') add('blocker', test.blocker);
    add('question', test.question);
    add('meaning', test.meaning);
    add('limit', test.claimBoundary);
    add('method', test.method);
  }
  add('roadmap', extra.roadmap);
  add('by', extra.by);
  add('request', extra.request);
  return fields;
}
