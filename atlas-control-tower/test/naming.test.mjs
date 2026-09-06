import test from 'node:test';import assert from 'node:assert/strict';
import {displayName,decorateGraph,humanizeId,canonicalId,DISPLAY_SOURCES} from '../lib/naming.mjs';

const node=(over={})=>({id:'test:T-MPF26-027',type:'TEST',label:'T-MPF26-027',...over});

test('canonical identifiers are never rewritten',()=>{
 assert.equal(canonicalId({id:'test:T-NEXO26-LRD-MOMBH-SHELLVK-044'}),'T-NEXO26-LRD-MOMBH-SHELLVK-044');
 const d=displayName(node());
 assert.equal(d.canonicalId,'T-MPF26-027');
 assert.equal(d.canonicalTitle,'T-MPF26-027');
});

test('label priority runs curated, backend, campaign, question, id',()=>{
 assert.equal(displayName(node({metadata:{curated_label:'Curada'},summary:'Q?'}),{campaignLabel:'Camp'}).displaySource,DISPLAY_SOURCES.CURATED);
 assert.equal(displayName(node({metadata:{display_name:'Do backend'}})).label,'Do backend');
 assert.equal(displayName(node({summary:'Pergunta científica.'}),{campaignLabel:'Microphysics Fingerprint'}).displaySource,DISPLAY_SOURCES.CAMPAIGN);
 assert.equal(displayName(node({summary:'Does the signal survive?'})).displaySource,DISPLAY_SOURCES.QUESTION);
 assert.equal(displayName({id:'test:T-XYZ',type:'TEST',label:'T-XYZ'}).displaySource,DISPLAY_SOURCES.ID_HUMANIZED);
});

test('a campaign-derived label keeps the trailing ordinal of the canonical id',()=>{
 const d=displayName(node(),{campaignLabel:'Microphysics Fingerprint'});
 assert.equal(d.label,'Microphysics Fingerprint · 027');
});

test('the scientific question is used verbatim, only shortened',()=>{
 const long='Does the V6 runtime compose with canonical payloads and pass exact embedded likelihood replays before target-ABI promotion? Extra clause that should not appear.';
 const d=displayName(node({summary:long}));
 assert.ok(d.label.startsWith('Does the V6 runtime compose'));
 assert.ok(!d.label.includes('Extra clause'));
 assert.ok(d.label.length<=96);
});

test('humanizing an id expands only known vocabulary and never decodes the unknown',()=>{
 assert.equal(humanizeId('PEER-MICRO-FINGERPRINT'),'Microphysics Fingerprint');
 assert.equal(humanizeId('T-CMB-014'),'CMB · 014');
 // ZZQ is not vocabulary anywhere in the projection: it stays as written
 assert.match(humanizeId('T-ZZQ-001'),/Zzq · 001/);
 assert.equal(humanizeId('SINGLE'),'SINGLE');
});

test('a backend label that merely repeats the id is not treated as a label',()=>{
 assert.equal(displayName({id:'test:T-A-1',type:'TEST',label:'T-A-1',summary:'Real question?'}).displaySource,DISPLAY_SOURCES.QUESTION);
});

test('search text reaches label, canonical id, question and campaign',()=>{
 const d=displayName(node({summary:'Fingerprint survives?'}),{campaignLabel:'Micro campaign'});
 for(const needle of ['T-MPF26-027','test:T-MPF26-027','Fingerprint survives?','Micro campaign'])
  assert.ok(d.searchText.includes(needle),'missing '+needle);
});

test('decorating a graph derives campaign labels from real CONTAINS edges only',()=>{
 const g={nodes:[
  {id:'campaign:C1',type:'CAMPAIGN',label:'Microphysics Fingerprint'},
  {id:'test:T-MPF26-027',type:'TEST',label:'T-MPF26-027'},
  {id:'test:T-LOOSE-9',type:'TEST',label:'T-LOOSE-9',summary:'Pergunta solta?'}
 ],edges:[{source:'campaign:C1',target:'test:T-MPF26-027',type:'CONTAINS'}]};
 const out=decorateGraph(g);
 const byId=Object.fromEntries(out.nodes.map(n=>[n.id,n]));
 assert.equal(byId['test:T-MPF26-027'].label,'Microphysics Fingerprint · 027');
 assert.equal(byId['test:T-LOOSE-9'].label,'Pergunta solta?');
 assert.equal(byId['campaign:C1'].label,'Microphysics Fingerprint');
 // ids untouched
 assert.deepEqual(out.nodes.map(n=>n.id),g.nodes.map(n=>n.id));
});

test('a name that happens to match the id is a name, not a code',()=>{
 const sys={id:'system:NEXO',type:'SYSTEM',label:'NEXO',summary:'Unified Cognitive Infrastructure.'};
 assert.equal(displayName(sys).label,'NEXO');
 assert.equal(displayName(sys).displaySource,DISPLAY_SOURCES.BACKEND);
 // a structured code that repeats the id is still treated as a code
 const t={id:'test:T-A-1',type:'TEST',label:'T-A-1',summary:'Pergunta?'};
 assert.equal(displayName(t).displaySource,DISPLAY_SOURCES.QUESTION);
});

test('date-bearing identifiers keep their canonical form instead of being mangled',()=>{
 const env={id:'result:ENV-T-BAT26-019-20260815-0131',type:'RESULT',label:'ENV-T-BAT26-019-20260815-0131'};
 const d=displayName(env);
 assert.equal(d.label,'ENV-T-BAT26-019-20260815-0131');
 assert.equal(d.displaySource,DISPLAY_SOURCES.ID);
});
