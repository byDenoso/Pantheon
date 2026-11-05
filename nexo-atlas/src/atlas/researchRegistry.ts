import index from './reviewedSourceIndex.json' with {type:'json'};
import registry from './researchRegistry.json' with {type:'json'};
import {publicationKey} from './publicSelection.ts';
import {groupPublicQuestions, type QuestionGroup} from './publicQuestionGroups.ts';
import {testAnchors, testHref} from './publicStudyRoutes.ts';
import type {Bilingual, PublicState, PublicTest} from './publicItems.ts';

export const PUBLIC_SOURCE_URL = `https://github.com/byDenoso/Pantheon/blob/${index.sourceCommit}/nexo-atlas/worker/public-cosmology.json`;
const sources = new Map(index.rows.map(row => [row.contentKey, row.sourceKey] as const));
export type PublicClaim = {group: QuestionGroup; test: PublicTest; href: string; sourceKey: string};

// The current owner selection is applied before this function. A row that is
// not in the versioned repository source cannot appear on the claims page.
export async function claimsFromPublic(pub: PublicState): Promise<PublicClaim[]> {
  if (pub.status !== 'ready') return [];
  const groups = groupPublicQuestions(pub.tests);
  const candidates = groups.flatMap(group => {
    const anchors = testAnchors(group.members.map(m => m.test));
    return group.members.map(({test}) => ({group, test, href:testHref(group.id, anchors.get(test.id))}));
  });
  const keys = await Promise.all(candidates.map(({test}) => publicationKey(test)));
  return candidates.flatMap((candidate, i) => {
    const key = keys[i], sourceKey = key ? sources.get(key) : undefined;
    return sourceKey ? [{...candidate, sourceKey}] : [];
  });
}

type Revision = {version:string;status:'ongoing'|'published'|'retracted'|'unknown';date:string|null;
 datasets:{name:string;doi:string|null}[]|null;code:{commit:string|null;zenodoDoi:string|null}|null;
 result:Bilingual|null;uncertainty:Bilingual|null;scope:Bilingual|null;limits:Bilingual|null;
 evidenceLevel:string|null;sourceKeys:string[];changeReason:Bilingual|null};
type RecordEntry = {questionId:string;versions:Revision[]};
export function researchRecord(questionId: string): RecordEntry|null {
  return (registry.records as RecordEntry[]).find(entry => entry.questionId === questionId) ?? null;
}
