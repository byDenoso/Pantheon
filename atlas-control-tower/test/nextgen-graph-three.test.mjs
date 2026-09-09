import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {layoutGraph,labelPolicy,depthRank,LINEAGE_BREAKPOINT} from '../nextgen/graph/layout.mjs';
import {placeLabels,SLACK,MAX_W} from '../nextgen/graph/labels.mjs';
import {frontendFiles} from '../frontend-files.mjs';

const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const builds=new Set(vercel.builds.map(b=>b.src));

const node=(id,type,extra={})=>({id,type,visualType:type,label:id,...extra});
const byId=list=>new Map(list.map(p=>[p.id,p]));

test('WebGL graph assets are declared on the public boundary and deployed',()=>{
  for(const file of ['nextgen/graph/layout.mjs','nextgen/graph/labels.mjs','nextgen/vendor/three.module.min.js']){
    assert.ok(frontendFiles.includes(file),`frontend boundary missing ${file}`);
    assert.ok(builds.has(file),`vercel build missing ${file}`);
  }
});

test('the vendored Three.js build is committed, not fetched at runtime',()=>{
  const url=new URL('../nextgen/vendor/three.module.min.js',import.meta.url);
  assert.ok(fs.existsSync(url),'vendored three build is missing');
  assert.ok(fs.statSync(url).size>100000,'vendored three build looks truncated');
  const engine=fs.readFileSync(new URL('../nextgen/graph/engine.mjs',import.meta.url),'utf8');
  assert.match(engine,/from '\.\.\/vendor\/three\.module\.min\.js'/);
  assert.doesNotMatch(engine,/https?:\/\/[^'"]*three/i,'engine must not import three from a CDN');
});

test('hierarchy depth separates nodes onto distinct z planes',()=>{
  const nodes=[
    node('system:NEXO','SYSTEM'),
    node('domain:a','DOMAIN'),
    node('campaign:a','CAMPAIGN'),
    node('test:a','TEST'),
    node('source:a','SOURCE')
  ];
  const p=byId(layoutGraph(nodes,{focus:'system:NEXO',semanticView:'macro'}));
  const z=id=>p.get(id).z;
  // Shallower ranks sit nearer the camera (larger z) than deeper ones.
  assert.ok(z('system:NEXO')>z('domain:a'));
  assert.ok(z('domain:a')>z('campaign:a'));
  assert.ok(z('campaign:a')>z('test:a'));
  assert.ok(z('test:a')>z('source:a'));
  assert.ok(depthRank({type:'SYSTEM'})<depthRank({type:'SOURCE'}));
});

test('a crowded ring widens, but its growth is bounded',()=>{
  const spread=count=>{
    const nodes=[node('system:NEXO','SYSTEM'),...Array.from({length:count},(_,i)=>node(`test:${i}`,'TEST'))];
    const p=layoutGraph(nodes,{focus:'system:NEXO',semanticView:'macro'}).filter(x=>x.id!=='system:NEXO');
    return Math.max(...p.map(x=>Math.hypot(x.x,x.y)));
  };
  // Crowding still pushes the ring outwards so members do not overlap...
  assert.ok(spread(400)>spread(20),'a crowded ring must widen');
  // ...but not without bound. Uncapped sqrt(population) growth threw a
  // 4000-node ring out to ~8600 units, which framed the camera so far back that
  // the inner rings collapsed to a dot and only crossing edges stayed visible.
  assert.ok(spread(4000)<spread(400)*1.6,'ring growth must be capped');
  assert.ok(spread(4000)<1200,'the outermost ring must stay in a framable range');
});

test('layout is deterministic and finite for a large graph',()=>{
  const nodes=Array.from({length:2000},(_,i)=>node(`test:${i}`,'TEST',{domain:`D${i%7}`}));
  const a=layoutGraph(nodes,{focus:'test:0',semanticView:'macro'});
  const b=layoutGraph(nodes,{focus:'test:0',semanticView:'macro'});
  assert.equal(a.length,2000);
  assert.ok(a.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));
  assert.deepEqual(a,b);
});

test('provenance lineage still flows vertically on narrow screens',()=>{
  const nodes=[node('claim:f','CLAIM'),node('source:d','SOURCE'),node('source-ref:d','SOURCE_REF')];
  const edges=[{source:'claim:f',target:'source:d',type:'OBSERVED_BY'},{source:'source:d',target:'source-ref:d',type:'LOCATED_AT'}];
  const p=byId(layoutGraph(nodes,{focus:'claim:f',semanticView:'provenance',viewportWidth:390,edges}));
  assert.ok(p.get('claim:f').y<p.get('source:d').y);
  assert.ok(Math.abs(p.get('claim:f').x-p.get('source:d').x)<40);
});

// --- label placement -------------------------------------------------------

const pt=(id,x,y,extra={})=>({id,node:node(id,'DOMAIN',{label:extra.label??id}),x,y,r:6,depth:0,visible:true});

test('every placed label stays attached to its own anchor',()=>{
  // Wide labels crowded against the right edge used to all clamp to the same x,
  // producing a column of captions detached from their nodes.
  const long='DOMAIN com um rotulo bastante comprido para forcar truncamento';
  const points=Array.from({length:14},(_,i)=>pt(`domain:${i}`,995,60+i*46,{label:long}));
  const placed=placeLabels(points,{width:1008,height:938,semanticView:'macro'});
  assert.ok(placed.length>0,'expected some labels');
  for(const l of placed){
    const anchor=points.find(p=>p.id===l.id);
    assert.ok(l.x>=anchor.x-l.w-SLACK-1,`${l.id} drifted left of its anchor`);
    assert.ok(l.x<=anchor.x+SLACK+1,`${l.id} drifted right of its anchor`);
    assert.ok(l.w<=MAX_W,'label exceeded the width cap');
  }
});

test('labels for off-screen anchors are dropped, not pulled into view',()=>{
  const points=[pt('domain:on',500,400),pt('domain:off',-800,400),pt('domain:far',4000,400)];
  const ids=placeLabels(points,{width:1000,height:800,semanticView:'macro'}).map(l=>l.id);
  assert.deepEqual(ids,['domain:on']);
});

test('placed labels never overlap each other',()=>{
  const points=Array.from({length:40},(_,i)=>pt(`domain:${i}`,120+(i%8)*90,120+Math.floor(i/8)*30));
  const placed=placeLabels(points,{width:1000,height:800,semanticView:'macro'});
  for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
    const a=placed[i],b=placed[j];
    const overlap=a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
    assert.ok(!overlap,`${a.id} overlaps ${b.id}`);
  }
});

test('the label budget honours the policy and always keeps the selection',()=>{
  const points=Array.from({length:80},(_,i)=>pt(`domain:${i}`,80+(i%10)*95,80+Math.floor(i/10)*80));
  const policy=labelPolicy(1200,'macro');
  const plain=placeLabels(points,{width:1200,height:900,semanticView:'macro'});
  assert.ok(plain.length<=policy.max,`expected <= ${policy.max}, got ${plain.length}`);
  // A node far down the priority order still gets its label when selected.
  const withSelection=placeLabels(points,{width:1200,height:900,semanticView:'macro',selected:'domain:79'});
  assert.ok(withSelection.some(l=>l.id==='domain:79'),'selected node lost its label');
});

test('mobile keeps a tighter label budget than desktop',()=>{
  assert.ok(labelPolicy(390,'macro').max<labelPolicy(1280,'macro').max);
  assert.ok(390<LINEAGE_BREAKPOINT);
});

test('a sparse graph still spreads instead of clumping at the centre',()=>{
  // The Drive bootstrap snapshot is seven nodes. A sqrt(population) radius with
  // no floor shrank ranks that small towards the origin.
  const nodes=[
    node('system:NEXO','SYSTEM'),node('system:SCIENCE','SYSTEM'),node('system:LEARNING','SYSTEM'),
    node('domain:a','DOMAIN'),node('domain:b','DOMAIN'),
    node('campaign:a','CAMPAIGN'),node('campaign:b','CAMPAIGN')
  ];
  const placed=layoutGraph(nodes,{focus:'system:NEXO',semanticView:'macro'})
    .filter(p=>p.id!=='system:NEXO');
  // Without the floor the innermost of these sat ~21px from the origin; with it
  // the same node clears ~53px, so 40 separates the two regimes cleanly.
  for(const p of placed){
    assert.ok(Math.hypot(p.x,p.y)>40,`${p.id} sits too close to the origin`);
  }
});
