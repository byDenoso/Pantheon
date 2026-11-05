import index from './reviewedSourceIndex.json' with {type:'json'};
import registry from './researchRegistry.json' with {type:'json'};
import {publicationKey} from './publicSelection.ts';
import {groupPublicQuestions, type QuestionGroup} from './publicQuestionGroups.ts';
import {testAnchors, testHref} from './publicStudyRoutes.ts';
import type {Bilingual, PublicState, PublicTest} from './publicItems.ts';

export const PUBLIC_SOURCE_URL = `https://github.com/byDenoso/Pantheon/blob/${index.sourceCommit}/nexo-atlas/worker/public-cosmology.json`;
const sources = new Map(index.rows.map(row => [row.contentKey, row.sourceKey] as const));
export type PublicClaim = {group: QuestionGroup; test: PublicTest; href: string; sourceKey: string;revision?:Revision};

// The current owner selection is applied before this function. A row that is
// not in the versioned repository source cannot appear on the claims page.
export async function claimsFromPublic(pub: PublicState, signal?:AbortSignal,entries:RecordEntry[]=registry.records as RecordEntry[]): Promise<PublicClaim[]> {
  if (signal?.aborted) throw new DOMException('Cancelled','AbortError');
  if (pub.status !== 'ready') return [];
  const groups = groupPublicQuestions(pub.tests);
  const candidates = groups.flatMap(group => {
    const anchors = testAnchors(group.members.map(m => m.test));
    return group.members.map(({test}) => ({group, test, href:testHref(group.id, anchors.get(test.id))}));
  });
  const keys = await Promise.all(candidates.map(({test}) => publicationKey(test)));
  if (signal?.aborted) throw new DOMException('Cancelled','AbortError');
  return candidates.flatMap((candidate, i) => {
    const key = keys[i], sourceKey = key ? sources.get(key) : undefined;
    if(!sourceKey||!key)return [];
    const resolution=claimRevisionState(candidate.group.id,key,entries);
    return resolution.kind==='unversioned'||resolution.kind==='current'?[{...candidate,sourceKey,...(resolution.revision?{revision:resolution.revision}:{})}]:[];
  });
}

// Never render a result computed for an older selection or an unavailable source.
export function currentVerifiedClaims(verified:{source:PublicState;rows:PublicClaim[]}|null, pub:PublicState, pending:boolean):PublicClaim[]|null {
  return !pending&&verified?.source===pub ? verified.rows : null;
}

export type Revision = {analysisId?:string;version:string;status:'ongoing'|'published'|'retracted'|'unknown';date:string|null;
 datasets:{name:string;doi:string|null}[]|null;code:{commit:string|null;zenodoDoi:string|null}|null;
 result:Bilingual|null;uncertainty:Bilingual|null;scope:Bilingual|null;limits:Bilingual|null;
 evidenceLevel:string|null;sourceKeys:string[];changeReason:Bilingual|null;
 publication?:{doi:string|null;arxiv:string|null}|null;
 provenance?:Record<string,{commit:string;path:string;sha256:string;pointer:string}>};
type RecordEntry = {questionId:string;versions:Revision[]};
// A question may group multiple analyses. Never inherit another row's verdict.
export function matchingClaimRevision(questionId:string,contentKey:string,entries:RecordEntry[]=registry.records as RecordEntry[]):Revision|undefined {
  return claimRevisionState(questionId,contentKey,entries).revision;
}
export function claimRevisionState(questionId:string,contentKey:string,entries:RecordEntry[]=registry.records as RecordEntry[]):{kind:'unversioned'|'ambiguous'|'current'|'superseded'|'retracted';revision?:Revision} {
  const versions=entries.find(entry=>entry.questionId===questionId)?.versions??[];
  const matches=versions.filter(revision=>revision.sourceKeys.includes(contentKey));
  if(!matches.length)return {kind:'unversioned'};
  const identities=new Set(matches.map(revision=>revision.analysisId));
  if(identities.size!==1||identities.has(undefined))return {kind:'ambiguous'};
  if(entries.some(entry=>entry.questionId!==questionId&&entry.versions.some(revision=>revision.analysisId===matches[0].analysisId)))return {kind:'ambiguous'};
  const revision=versions.filter(revision=>revision.analysisId===matches[0].analysisId).at(-1)!;
  return {kind:revision.status==='retracted'?'retracted':revision.sourceKeys.includes(contentKey)?'current':'superseded',revision};
}
export function researchRecord(questionId: string): RecordEntry|null {
  return (registry.records as RecordEntry[]).find(entry => entry.questionId === questionId) ?? null;
}
