import copy from './public-cosmology.json' with {type:'json'};
import {publicationKey} from './public-publication.mjs';
import {validatePublicTests} from './public-tests.mjs';
import {guardVisual} from '../src/atlas/publicVisuals.ts';
// Exact, reviewed public-source allowlist. Source records and Tower are untouched.
// Unknown/changed records require another editorial review before publication.
export function cosmologyPublicProjection(payload) {
  const admitted=new Map();
  const tests=(payload.tests??[]).flatMap(row=>{
    const key=publicationKey(row),fields=copy.records[key];
    if(!fields)return [];
    const checked=validatePublicTests([fields])[0];
    const item={...checked,published_at:row.published_at,updated_at:copy.updated_at};
    admitted.set(key,item);return [item];
  });
  const visuals=(payload.visuals??[]).flatMap(v=>{
    if(v.evidenceKind!=='SCIENTIFIC_RESULT')return [];
    if(v.subject.kind!=='legacy-test')return []; // Separate Writer-approved campaign release required.
    const source=admitted.get(publicationKey(v.subject));if(!source)return [];
    const fields=Object.fromEntries(['question','answers','method','result'].map(k=>[k,source[k]]));
    const next=guardVisual({...v,subject:{kind:'legacy-test',...fields},limitations:[source.answers,...v.limitations.slice(1)]});
    if(!next)throw Error('PUBLIC_COSMOLOGY_VISUAL_INVALID');return [next];
  });
  return {...payload,tests,visuals};
}
