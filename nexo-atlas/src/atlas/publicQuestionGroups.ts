import aliases from './publicQuestionAliases.json' with {type:'json'};
import catalog from './publicQuestionCatalog.json' with {type: 'json'};
import {pick, type Bilingual, type PublicTest} from './publicItems.ts';
import type {Locale} from './api.ts';

export type QuestionMember = {test: PublicTest; label: Bilingual; detail: Bilingual; section: Bilingual; repeat: boolean};
export type QuestionGroup = {id: string; title: Bilingual; scope: Bilingual; members: QuestionMember[]; total: number};
const empty = {'pt-BR': '', en: ''};
// Editorial membership is exact and uses only already-reviewed public wording.
// Unrecognized questions remain separate. No similarity score, source identifier,
// status or shared result can silently merge records or establish a conclusion.
const membership = new Map(catalog.flatMap(group => group.members.map(member => [member.question, {group, member}] as const)));
export function groupPublicQuestions(tests: PublicTest[]): QuestionGroup[] {
  const groups = new Map<string, QuestionGroup>();
  for (const test of tests) {
    const reviewed = membership.get((aliases as Record<string,string>)[test.question['pt-BR']]??test.question['pt-BR']);
    const id = reviewed ? `question-${reviewed.group.key}` : `question-${test.id}`;
    if (!groups.has(id)) groups.set(id, {id, title: reviewed?.group.title ?? test.question, scope: reviewed?.group.scope ?? empty, members: [], total: 0});
    const group = groups.get(id)!;
    group.members.push({test, label: reviewed?.member.label ?? test.question, detail: reviewed?.member.detail ?? empty, section: reviewed?.member.section ?? empty, repeat: reviewed?.member.repeat ?? false});
    group.total++;
  }
  return [...groups.values()];
}
const normalized = (value: string, locale: Locale) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase(locale);
export function filterPublicQuestions(groups: QuestionGroup[], query: string, locale: Locale): QuestionGroup[] {
  const q = normalized(query.trim(), locale);
  if (!q) return groups;
  const matches = (value: Bilingual) => normalized(pick(value, locale), locale).includes(q);
  return groups.flatMap(group => {
    // A main-question match opens the whole question. A detail match keeps only
    // matching tests, with the unfiltered group count retained for context.
    if (matches(group.title) || (pick(group.scope, locale) && matches(group.scope))) return [group];
    const members = group.members.filter(({test, label, detail, section}) => [label, detail, section, test.question, test.answers, test.method, test.result].some(matches));
    return members.length ? [{...group, members}] : [];
  });
}

// Publication/update timestamps only; never infer scientific execution dates.
export function publicRecency(test: PublicTest): number {
  const dates = [test.published_at, test.updated_at].map(value => value ? Date.parse(value) : NaN).filter(Number.isFinite);
  return dates.length ? Math.max(...dates) : -Infinity;
}
export function newestPublicQuestions(groups: QuestionGroup[]): QuestionGroup[] {
  return groups.map(group => ({...group, members: [...group.members].sort((a,b) => {
    const x=publicRecency(a.test), y=publicRecency(b.test); return x===y ? 0 : y>x ? 1 : -1;
  })})).sort((a,b) => {
    const x=a.members.length ? publicRecency(a.members[0].test) : -Infinity;
    const y=b.members.length ? publicRecency(b.members[0].test) : -Infinity;
    return x===y ? 0 : y>x ? 1 : -1;
  });
}
