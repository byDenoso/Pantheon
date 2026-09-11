import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlobalSearchModel } from '../src/data/global-search-model.ts';

const science={nodes:[
 {id:'T-DE-001',type:'TEST',label:'Dark energy runtime test',summary:'DESI cross-check',domain:'D3',status:'PASS'},
 {id:'H-H0-001',type:'CLAIM',label:'H0 claim',summary:'late-time expansion',domain:'D1',status:'ACTIVE'}
]};
const olympus={nodes:[{id:'olympus:person:p1',type:'PERSON',label:'Atleta Um',summary:'evolução publicada',status:'ACTIVE'}]};
const learning={ladder:[{id:'PATTERN',items:[{id:'pattern:p1',relationType:'Pointer-first resolution',notes:'Reusable runtime pattern',status:'VALIDATED'}]}]};
const ops={actions:[{id:'action:a1',label:'Repair runtime',summary:'CI blocked',status:'BLOCKED',domain:'ENGINEERING'}],events:[]};
const runs=[{id:'run:r1',label:'SCIENCE · SUCCESS',summary:'runtime finished',status:'SUCCESS',domain:'SCIENCE'}];
const audit={categories:[{id:'BROKEN_REFERENCE',label:'Broken reference',count:4,openCount:1}]};
test('global search groups declared results and gives each one a navigable route',()=>{
 const model=buildGlobalSearchModel({query:'runtime',science,olympus,learning,ops,runs,audit});
 assert.equal(model.query,'runtime');
 assert.ok(model.results.some(x=>x.group==='Ciência'&&x.path==='/graphs/science/D3?entity=T-DE-001'));
 assert.ok(model.results.some(x=>x.group==='Learning'&&x.path==='/graphs?learning=1&entity=pattern%3Ap1'));
 assert.ok(model.results.some(x=>x.group==='Operação'&&x.path==='/operations?action=action%3Aa1'));
 assert.ok(model.results.some(x=>x.group==='Operação'&&x.path==='/operations?run=run%3Ar1'));
});

test('global search does not synthesize results from unavailable sources',()=>{
 const model=buildGlobalSearchModel({query:'atleta',science:null,olympus:null,learning:null,ops:null,runs:null,audit:null});
 assert.deepEqual(model.results,[]);
 assert.equal(model.availableSources,0);
});

test('blank queries yield no results and do not perform fuzzy invention',()=>{
 const model=buildGlobalSearchModel({query:'   ',science,olympus,learning,ops,runs,audit});
 assert.deepEqual(model.results,[]);
});
