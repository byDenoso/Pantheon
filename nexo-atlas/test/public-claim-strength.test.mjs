import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {publicAtlasProjection} from '../worker/public-tests.mjs';import {publicEditorialProjection} from '../worker/public-editorial.mjs';
const old=publicAtlasProjection().tests,edited=publicEditorialProjection(publicAtlasProjection()).tests;
const manifest=JSON.parse(readFileSync('docs/public-claim-review.json'));
const numbers=s=>s.match(/\d+(?:[.,]\d+)?/g)||[];
test('111 reviewed rephrasings introduce no numerical evidence beyond existing public fields',()=>{
 assert.equal(manifest.count,111);assert.equal(manifest.scientific_upgrade,false);
 const changed=new Set(manifest.changes.map(x=>x.index));
 for(let i=0;i<old.length;i++){
  if(!changed.has(i)){assert.equal(edited[i].result['pt-BR'],old[i].result['pt-BR']);continue;}
  const available=new Set(Object.values(old[i]).filter(v=>v && typeof v==='object').flatMap(v=>numbers(v['pt-BR']||'')));
  for(const n of numbers(edited[i].result['pt-BR']))assert.ok(available.has(n),`row ${i}: new numeric token ${n}`);
  assert.equal(edited[i].answers['pt-BR'],old[i].answers['pt-BR']);
 }
});
test('strong wording retains scoped robustness, no model detection, and classical/quantum distinction',()=>{
 assert.match(edited[1].result['pt-BR'],/^Retirar.*94%.*melhora do ajuste/);
 assert.match(edited[1].result['pt-BR'],/não estabelece dependência exclusiva/);
 assert.match(edited[24].result['pt-BR'],/sem estabelecer uma detecção global/);
 assert.match(edited[168].result['pt-BR'],/não há preferência estabelecida/);
 assert.match(edited[156].result['pt-BR'],/não sua estabilidade quântica/);
 assert.match(edited[214].result['pt-BR'],/não estabelecia a consistência completa/);
 // Huge joint full-shape statistics have not been promoted into independent tracer detections.
 for(let i=147;i<=155;i++)assert.equal(edited[i].result['pt-BR'],old[i].result['pt-BR']);
});
