/** Orbital semantics for the production R3F renderer.
 * Geometry is navigation only and never upgrades derived relations to evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const domainNodes=count=>[
 {id:'domain:D7',type:'DOMAIN',label:'CMB',domain:'D7'},
 ...Array.from({length:count},(_,i)=>({id:`TEST-D7-${String(i+1).padStart(3,'0')}`,type:'TEST',label:`Question ${i+1}`,domain:'D7',domains:['D7']}))
];

test('R3F orbital positions are deterministic and keep the focus at the origin',async()=>{
 const {buildOrbitalNodes}=await import('../src/scene/types.ts');
 const nodes=domainNodes(32);
 const a=buildOrbitalNodes(nodes,'domain:D7'),b=buildOrbitalNodes(nodes,'domain:D7');
 assert.deepEqual(a,b);
 assert.deepEqual(a[0].position,[0,0,0]);
 for(const node of a)for(const value of node.position)assert.ok(Number.isFinite(value));
});

test('orbital positions retain real depth and distribute children around the focus',async()=>{
 const {buildOrbitalNodes}=await import('../src/scene/types.ts');
 const kids=buildOrbitalNodes(domainNodes(40),'domain:D7').slice(1);
 const xs=kids.map(n=>n.position[0]),ys=kids.map(n=>n.position[1]),zs=kids.map(n=>n.position[2]);
 assert.ok(xs.some(x=>x<-1)&&xs.some(x=>x>1));
 assert.ok(ys.some(y=>y<-1)&&ys.some(y=>y>1));
 assert.ok(zs.some(z=>z<-1)&&zs.some(z=>z>1));
 assert.ok(Math.max(...zs)-Math.min(...zs)>6,'R3F graph collapsed into a flat plane');
});

test('semantic LOD bounds dense views without dropping focus or selected nodes',async()=>{
 const {selectSemanticLOD}=await import('../src/scene/semantic-lod.ts');
 const nodes=domainNodes(300);
 const selectedId=nodes.at(-1).id;
 const out=selectSemanticLOD(nodes,{focusId:'domain:D7',selectedId,visibleBudget:36,labelBudget:18});
 assert.ok(out.visibleIds.size<=36);
 assert.equal(out.visibleIds.has('domain:D7'),true);
 assert.equal(out.visibleIds.has(selectedId),true);
 assert.ok(out.labelIds.size<=18);
});

test('the More entities affordance survives the density cap and calls session.more',()=>{
 const app=read('src/App.tsx');
 const session=read('src/state/useAtlasSession.ts');
 assert.match(app,/id="more"/);
 assert.match(app,/actions\.more\(\)/);
 assert.match(session,/session\.more\(\)/);
});

test('cross-domain and intra-domain semantics still come only from declared membership',async()=>{
 const {classifyEdge}=await import('../ui/filaments.mjs');
 const a={id:'T1',type:'TEST',domain:'D7',domains:['D7']};
 const b={id:'T2',type:'PATTERN',domain:'D2',domains:['D2']};
 assert.equal(classifyEdge(a,b,{type:'RELATES_TO'}),'cross-domain');
 assert.equal(classifyEdge(a,{id:'domain:D7',type:'DOMAIN',domain:'D7'},{type:'CONTAINS'}),'intra-domain');
 assert.equal(classifyEdge(a,{...a,id:'T3'},{type:'RELATES_TO'}),'intra-test');
});

test('production filaments are instanced, bounded to declared edges and GPU animated',()=>{
 const scene=read('src/scene/InstancedFilaments.tsx');
 const materials=read('src/scene/materials.ts');
 assert.match(scene,/<instancedMesh/);
 assert.match(scene,/edges\.filter/);
 assert.match(scene,/positions\.has\(edge\.source\).*positions\.has\(edge\.target\)/s);
 assert.doesNotMatch(scene,/setInterval|setTimeout|document\.createElement/);
 assert.match(materials,/time\.mul/);
 assert.match(materials,/three\/tsl/);
});

test('reduced motion prevents automatic camera orbit',()=>{
 const canvas=read('src/scene/AtlasCanvas.tsx');
 assert.match(canvas,/autoOrbit&&!reducedMotion/);
 assert.match(canvas,/prefers-reduced-motion|reducedMotion/);
});

test('GPU picking uses stable instance ids and asynchronous pixel readback',()=>{
 const picking=read('src/scene/gpu-picking.ts');
 const nodeScene=read('src/scene/InstancedNodes.tsx');
 assert.match(picking,/readRenderTargetPixelsAsync/);
 assert.match(picking,/24-bit RGB/);
 assert.match(nodeScene,/encodePickId\(node\.pickId\)/);
 assert.match(nodeScene,/setColorAt/);
});

test('HTML labels stay outside the GPU scene and are semantically bounded',()=>{
 const overlay=read('src/scene/LabelOverlay.tsx');
 const canvas=read('src/scene/AtlasCanvas.tsx');
 assert.match(overlay,/atlas-label-overlay/);
 assert.match(overlay,/labelIds\.has/);
 assert.doesNotMatch(overlay,/<Html/);
 assert.match(canvas,/labelBudget:compact\?20:36/);
});

test('decision summaries remain derived and never expose private reasoning',async()=>{
 const {decisionSummary,DECISION_STEPS}=await import('../ui/decision-summary.mjs');
 const source=read('ui/decision-summary.mjs')+read('ui/blackbox-view.mjs');
 assert.doesNotMatch(source,/chain[- ]of[- ]thought|cadeia de pensamento|raciocínio interno/i);
 assert.equal(decisionSummary({status:'SUCCESS'}).authority,'DERIVED_NOT_EVIDENCE');
 assert.deepEqual(DECISION_STEPS.map(s=>s.id),['observations','patterns','comparisons','hypotheses','evidence','decision','confidence','next']);
});

test('human labels preserve canonical ids internally without displaying hashes',async()=>{
 const {nodeDisplayLabel}=await import('../ui/cockpit-copy.mjs');
 const hash='6b54a91e721785807ff0e90c897010b6';
 assert.doesNotMatch(nodeDisplayLabel({id:hash,label:hash}),new RegExp(hash));
 assert.equal(nodeDisplayLabel({id:'T-CMB-001',label:'T-CMB-001'}),'T-CMB-001');
});
