import {createHash} from 'node:crypto';
import {guardVisual} from '../../src/atlas/publicVisuals.ts';
export const VISUAL_CONTRACT='ATLAS_PUBLIC_VISUALS_V1';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export const visualDigest=v=>'sha256:'+createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(v);
const iso=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=Date.now();
const digest=v=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
// Only a pre-approved, sanitized Writer export may enter the package. These
// checks verify the export; they neither approve evidence nor mutate Tower.
export function validatePublicVisualSnapshot(value){
  if(value?.contract!==VISUAL_CONTRACT||!digest(value.sourceRevision)||!iso(value.generatedAt)||!Array.isArray(value.visuals)||value.visuals.length>200||!Array.isArray(value.approvals)||value.approvals.length!==value.visuals.length)throw new Error('PUBLIC_VISUAL_SNAPSHOT_INVALID');
  const ids=new Set();
  const visuals=value.visuals.map(raw=>{const v=guardVisual(raw);if(!v||ids.has(v.id)||JSON.stringify(stable(v))!==JSON.stringify(stable(raw)))throw new Error('PUBLIC_VISUAL_INVALID');ids.add(v.id);
    const matches=value.approvals.filter(a=>a?.visualId===v.id);const a=matches[0];
    if(matches.length!==1||a.visualDigest!==visualDigest(v)||a.subjectDigest!==visualDigest(v.subject)||a.publication?.policy!=='NEXO_PUBLIC_VISUALS_V1'||a.publication.status!=='APPROVED'||!id(a.publication.receiptId)||!iso(a.publication.approvedAt))throw new Error('PUBLIC_VISUAL_APPROVAL_MISSING');
    if(v.evidenceKind==='SCIENTIFIC_RESULT'&&(a.review?.policy!=='NEXO_SCIENTIFIC_INDEPENDENCE_V1'||a.review.eligible!==true||!id(a.review.receiptId)||!iso(a.review.reviewedAt)||Date.parse(a.review.reviewedAt)>Date.parse(a.publication.approvedAt)))throw new Error('PUBLIC_VISUAL_REVIEW_MISSING');
    if(Date.parse(a.publication.approvedAt)>Date.parse(value.generatedAt)||Date.parse(v.publishedAt)>Date.parse(value.generatedAt))throw new Error('PUBLIC_VISUAL_DATE_INVALID');
    return v;});
  const body={contract:value.contract,sourceRevision:value.sourceRevision,generatedAt:value.generatedAt,visuals,approvals:value.approvals};
  if(value.snapshotDigest!==visualDigest(body)||JSON.stringify(stable({...body,snapshotDigest:value.snapshotDigest}))!==JSON.stringify(stable(value)))throw new Error('PUBLIC_VISUAL_SNAPSHOT_DRIFT');
  return {...body,snapshotDigest:value.snapshotDigest};
}
export function bindPublicVisuals(snapshot,projection){
  const visuals=snapshot.visuals.filter(v=>{
    if(v.subject.kind==='legacy-test')return (projection.tests??[]).some(t=>['question','answers','method','result'].every(k=>JSON.stringify(stable(t[k]))===JSON.stringify(stable(v.subject[k]))));
    const c=(projection.campaigns??[]).find(c=>c.id===v.subject.campaignId);const t=c?.tests.find(t=>t.id===v.subject.testId);
    return t?.stage==='REVIEWED'&&t.updatedAt===v.subject.updatedAt&&t.result!=null&&JSON.stringify(stable(t.result))===JSON.stringify(stable(v.subject.result));
  });
  if(visuals.length!==snapshot.visuals.length)throw new Error('PUBLIC_VISUAL_SUBJECT_UNPUBLISHED');
  return {...projection,visualsContract:VISUAL_CONTRACT,visuals};
}
