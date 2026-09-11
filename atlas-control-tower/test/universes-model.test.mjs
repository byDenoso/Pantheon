import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUniversesModel, buildSubdomainsModel } from '../src/data/universes-model.ts';

const root={source:'v1',freshness:'LIVE',nodes:[
 {id:'system:NEXO',type:'SYSTEM',label:'NEXO'},
 {id:'system:SCIENCE',type:'SYSTEM',label:'Ciência',status:'active'},
 {id:'system:ENGINEERING',type:'SYSTEM',label:'Engineering',status:'active'},
 {id:'system:OLYMPUS',type:'SYSTEM',label:'Olympus',status:'active'},
 {id:'system:AUTOMATION',type:'SYSTEM',label:'Black Box',status:'active'},
 {id:'system:LEARNING',type:'SYSTEM',label:'Learning',status:'active'},
],edges:[
 {source:'system:NEXO',target:'system:SCIENCE',type:'CONTAINS'},
 {source:'system:NEXO',target:'system:ENGINEERING',type:'CONTAINS'},
 {source:'system:NEXO',target:'system:OLYMPUS',type:'CONTAINS'},
 {source:'system:NEXO',target:'system:AUTOMATION',type:'CONTAINS'},
 {source:'system:NEXO',target:'system:LEARNING',type:'CONTAINS'},
]};
const science={source:'v1',freshness:'LIVE',nodes:[
 {id:'system:SCIENCE',type:'SYSTEM',label:'Ciência'},
 {id:'domain:D3',type:'DOMAIN',label:'Dark Energy & Late-Time Dynamics',domain:'D3',status:'ACTIVE'},
 {id:'domain:D1',type:'DOMAIN',label:'Expansion, H0 & Acoustic Geometry',domain:'D1',status:'ACTIVE'},
 {id:'domain:M1',type:'DOMAIN',label:'Scientific Inference, Likelihood Validation & Reproducibility',domain:'M1',status:'ACTIVE'},
],edges:[]};
const olympus={source:'v1',freshness:'LIVE',nodes:[
 {id:'system:OLYMPUS',type:'SYSTEM',label:'Olympus'},
 {id:'olympus:person:1',type:'PERSON',label:'Pessoa A',status:'STALE'},
 {id:'olympus:state:1',type:'STATE',label:'Estado atual · Pessoa A',status:'STALE'},
],edges:[]};

test('universes model exposes declared product universes and excludes transversal areas',()=>{
 const model=buildUniversesModel(root,{science,olympus});
 assert.equal(model.available,true);
 assert.deepEqual(model.items.map(x=>x.id),['science','engineering','olympus']);
 assert.deepEqual(model.items.map(x=>x.label),['Ciência','Engenharia','Olympus']);
 assert.deepEqual(model.items.map(x=>x.path),['/universes/science','/universes/engineering','/universes/olympus']);
 assert.equal(model.items[0].subdomainCount,3);
 assert.equal(model.items[2].entityCount,2);
 assert.doesNotMatch(JSON.stringify(model),/neon|black box/i);
});
test('science subdomains keep canonical D1..D11,M1 ordering and stable routes',()=>{
 const model=buildSubdomainsModel('science',science);
 assert.deepEqual(model.items.map(x=>x.id),['D1','D3','M1']);
 assert.equal(model.items[1].label,'Dark Energy & Late-Time Dynamics');
 assert.equal(model.items[1].path,'/universes/science/D3');
});

test('missing universe graphs stay unavailable and never synthesize subdomains',()=>{
 const missing=buildUniversesModel(null,{});
 assert.equal(missing.available,false);
 assert.deepEqual(missing.items,[]);
 assert.deepEqual(buildSubdomainsModel('olympus',null).items,[]);
});