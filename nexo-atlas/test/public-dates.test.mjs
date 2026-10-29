import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationDates,publicationKey} from '../worker/public-publication.mjs';
import {publicDate,guardTest} from '../src/atlas/publicItems.ts';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
const row=()=>({question:{'pt-BR':'Qual é a resposta científica?',en:'What is the scientific answer?'},answers:{'pt-BR':'Investiga a estabilidade da estimativa.',en:'Investigates estimate stability.'},method:{'pt-BR':'Compara duas amostras independentes.',en:'Compares two independent samples.'},result:{'pt-BR':'A estimativa permaneceu estável.',en:'The estimate remained stable.'}});
test('metadata is linked to exact reviewed content and does not infer dates',()=>{
 const r=row(),at='2026-10-06T04:40:46.417Z',records={[publicationKey(r)]:{published_at:at,updated_at:at}};
 assert.deepEqual(publicationDates(r,records),{published_at:at,updated_at:at});
 assert.deepEqual(publicationDates({...r,result:{...r.result,en:'A changed conclusion.'}},records),{published_at:null,updated_at:null});
});
test('client rejects invalid/future dates and updates older than publication',()=>{
 assert.equal(publicDate('garbage'),null);assert.equal(publicDate('2099-01-01T00:00:00Z'),null);
 const parsed=guardTest({...row(),published_at:'2026-10-06T00:00:00Z',updated_at:'2026-10-05T00:00:00Z'});
 assert.equal(parsed.updated_at,null);
 assert.equal(guardTest(row()).published_at,null);
});
test('current public records preserve content and have no inferred execution timestamps',()=>{
 const rows=publicAtlasProjection().tests;assert.equal(rows.length,215);
 for(const r of rows){assert.ok('published_at' in r);assert.ok('updated_at' in r);assert.equal('created_at' in r,false);}
});
test('historical dates come from successful content-matched publications',()=>{
 const rows=publicAtlasProjection().tests;
 assert.equal(rows.filter(r=>r.published_at).length,207);
 assert.equal(rows.filter(r=>r.updated_at).length,215);
 assert.ok(rows.every(r=>!r.published_at || r.published_at.startsWith('2026-10-06')));
 assert.ok(rows.every(r=>r.updated_at.startsWith('2026-10-06')));
});
