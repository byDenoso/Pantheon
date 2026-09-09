import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const sectionModule=path.join(lab,'graph/section-views.mjs');

const source={
 rootId:'system:NEXO',
 source:{kind:'drive-ssot',tabs:['Science','Relations','Olympus','NEXO']},
 nodes:[
  {id:'system:NEXO',recordId:'NEXO',label:'NEXO',hierarchyLevel:'root',type:'SYSTEM',system:'NEXO',status:'ACTIVE'},
  {id:'domain:A',recordId:'A',label:'A',hierarchyLevel:'domain',type:'DOMAIN',system:'SCIENCE',status:'ACTIVE',parentId:'system:NEXO'},
  {id:'domain:B',recordId:'B',label:'B',hierarchyLevel:'domain',type:'DOMAIN',system:'ENGINEERING',status:'NEEDS_DATA',parentId:'system:NEXO'},
  {id:'program:A1',recordId:'PROG-A1',label:'Program A1',hierarchyLevel:'program',type:'PROGRAM',system:'SCIENCE',status:'ACTIVE',sheetTab:'Science',parentId:'domain:A'},
  {id:'program:B1',recordId:'PROG-B1',label:'Program B1',hierarchyLevel:'program',type:'PROGRAM',system:'ENGINEERING',status:'BLOCKED',sheetTab:'Engineering',parentId:'domain:B'},
  {id:'campaign:A1',recordId:'CAMP-A1',label:'Campaign A1',hierarchyLevel:'campaign',type:'CAMPAIGN',system:'SCIENCE',status:'SUPPORTED',sheetTab:'Science',parentId:'program:A1'}
 ],
 edges:[
  {id:'e1',source:'system:NEXO',target:'domain:A'},
  {id:'e2',source:'system:NEXO',target:'domain:B'},
  {id:'e3',source:'domain:A',target:'program:A1'},
  {id:'e4',source:'domain:B',target:'program:B1'},
  {id:'e5',source:'program:A1',target:'campaign:A1'}
 ]
};

const runtime={
 hostname:'nexo-atlas-graph-lab.vercel.app',
 assetHost:'cdn.jsdelivr.net',
 commit:'0123456789abcdef0123456789abcdef01234567',
 rendererMode:'three-canvas',
 theme:'dark',
 options:{nodeRadius:1,glow:.75,fog:.34,drift:0,pulseSpeed:1,maxLabels:24,maxVisibleNodes:110}
};

test('top navigation declares six real Atlas sections instead of dead hash anchors',()=>{
 const html=fs.readFileSync(path.join(lab,'index.html'),'utf8');
 const app=fs.readFileSync(path.join(lab,'app.mjs'),'utf8');
 for(const section of ['graph','domains','ssot','analytics','deploy','settings'])assert.match(html,new RegExp(`data-section=['\"]${section}['\"]`));
 assert.match(app,/buildSectionGraph/);
 assert.match(app,/setSection\(/);
 assert.match(app,/\.topbar-nav \[data-section\]/);
});

test('each top-level section produces a materially different graph projection from canonical data or runtime facts',async()=>{
 assert.ok(fs.existsSync(sectionModule),'graph/section-views.mjs must exist');
 const {buildSectionGraph}=await import(pathToFileURL(sectionModule));
 const domains=buildSectionGraph(source,'domains',runtime);
 const ssot=buildSectionGraph(source,'ssot',runtime);
 const analytics=buildSectionGraph(source,'analytics',runtime);
 const deploy=buildSectionGraph(source,'deploy',runtime);
 const settings=buildSectionGraph(source,'settings',runtime);
 assert.deepEqual(domains.nodes.map(n=>n.id),['system:NEXO','domain:A','domain:B','program:A1','program:B1']);
 assert.equal(domains.nodes.some(n=>n.hierarchyLevel==='campaign'),false);
 assert.ok(ssot.nodes.some(n=>n.id==='section:ssot:authority'));
 assert.ok(ssot.nodes.some(n=>/Science/i.test(n.label)));
 assert.ok(analytics.nodes.some(n=>n.id==='section:analytics:blocked'));
 assert.ok(analytics.nodes.some(n=>n.recordId==='PROG-B1'));
 assert.ok(deploy.nodes.some(n=>n.label.includes('nexo-atlas-graph-lab.vercel.app')));
 assert.ok(deploy.nodes.some(n=>n.label.includes('cdn.jsdelivr.net')));
 assert.ok(settings.nodes.some(n=>n.label==='DARK'));
 assert.ok(settings.nodes.some(n=>/110/.test(n.label)));
 const signatures=[domains,ssot,analytics,deploy,settings].map(view=>view.nodes.map(n=>n.id).join('|'));
 assert.equal(new Set(signatures).size,5);
 assert.equal(source.nodes[3].parentId,'domain:A','section projections must not mutate canonical hierarchy');
});
