import {createSyntheticGraph} from './data/synthetic-graph.mjs';
import {loadSsotGraph,loadSsotSnapshot,SSOT_SPREADSHEET_URL} from './data/ssot.mjs';
import {loadAssociativeMemory,loadAssociativeSnapshot,mergeAssociativeOverlay} from './data/associative-memory.mjs';
import {isBindableRecordId} from './data/operations.mjs';
import {hierarchyView,expandForSearch,hierarchyExpandableIds,collapseSubtree,expandHierarchyNode,ancestorsOf} from './graph/projection.mjs';
import {assignIdentityColors,domainLegend} from './graph/identity.mjs';
import {buildSectionGraph,ATLAS_SECTIONS} from './graph/section-views.mjs';
import './graph/canvas-reference-background.mjs';
import './graph/experience/editorial-observatory-v5.mjs';
import {installVisualExperienceV4} from './graph/experience/visual-experience-v4.mjs';
import {createGraphRenderer} from './graph/renderers/renderer-factory.mjs';
import {resolveRenderer} from './graph/renderers/renderer-registry.mjs';
import {rendererNavigationUrl} from './graph/renderers/renderer-runtime.mjs';
import {createCockpit} from './cockpit.mjs';

const $=id=>document.getElementById(id);
const rendererRoot=$('graph-renderer-root');
const params=new URLSearchParams(location.search);
const demoMode=params.get('demo')==='1';
const hashSection=location.hash==='#graph-stage'?'graph':location.hash.replace(/^#/,'');

const placeholderGraph=()=>({rootId:'system:NEXO',nodes:[{id:'system:NEXO',label:'NEXO',type:'SYSTEM',kind:'SYSTEM',hierarchyLevel:'root',system:'NEXO',status:'LOADING',authority:'canonical',hiddenChildren:0,ops:{level:'root',status:'LOADING',tone:'idle',summary:'Lendo NEXO · SSOT CANONICAL.',rollup:{},sections:[]}}],edges:[]});

let graph=demoMode?createSyntheticGraph(50):placeholderGraph();
let baseGraph=graph;
let associativeOverlay=null;
let associativeLoadToken=0;
let expandedIds=new Set();
let selectedId=graph.rootId;
let focusId=graph.rootId;
let history=[];
let activeOnly=false;
let showAlternativeFilaments=false;
let cockpitTab='visao';
let activeSection=ATLAS_SECTIONS.includes(hashSection)?hashSection:'graph';

const mobileViewport=()=>typeof matchMedia==='function'&&matchMedia('(max-width:760px)').matches;
const legacyRendererId=params.get('renderer')==='legacy-canvas'?'canvas-2d':'three-25d';
const requestedRendererId=params.get('renderer-v4')||legacyRendererId;
const rendererInfo=resolveRenderer(requestedRendererId,{mobile:mobileViewport()});
const rendererId=rendererInfo.id;
const rendererMode=rendererInfo.baseRenderer;
$('renderer').value=rendererId;
$('graph-lab-canvas').hidden=rendererInfo.target!=='canvas';

const dataset=$('dataset-size');
if(!demoMode){dataset.disabled=true;dataset.title='Produção lê NEXO · SSOT CANONICAL no Drive. Use ?demo=1 para datasets sintéticos.'}

const badge=document.querySelector('.stage-badge span');
const badgeBox=document.querySelector('.stage-badge');
function setBadge(text,{openSsot=false,tone='idle'}={}){
 if(badge)badge.textContent=text;
 if(!badgeBox)return;
 badgeBox.dataset.tone=tone;
 badgeBox.style.cursor=openSsot?'pointer':'default';
 badgeBox.title=openSsot?'Abrir NEXO · SSOT CANONICAL no Drive':'';
 badgeBox.onclick=openSsot?()=>window.open(SSOT_SPREADSHEET_URL,'_blank','noopener'):null;
}
if(demoMode)setBadge('DEMO · SYNTHETIC DATA');
else if(rendererMode==='legacy-canvas'&&params.get('fallback')==='sigma-init')setBadge('SSOT CONNECTING · LEGACY CANVAS');
else setBadge('SSOT CONNECTING · DRIVE');

// --- hierarchy and section state ------------------------------------------

const nodeById=id=>graph.nodes.find(node=>node.id===id)||null;
const expandableIds=()=>hierarchyExpandableIds(graph);

function runtimeFacts(){
 const moduleUrl=new URL(import.meta.url);
 const commit=/@([0-9a-f]{40})\//i.exec(moduleUrl.pathname)?.[1]||'';
 return{
  hostname:location.hostname,
  assetHost:moduleUrl.hostname,
  commit,
  rendererMode,
  theme:document.documentElement.dataset.theme||'dark',
  options:{...renderer.options}
 };
}

function currentView(){
 const view=activeSection==='graph'?hierarchyView(graph,{expandedIds,activeOnly,showAlternativeFilaments,selectedId}):buildSectionGraph(activeSection,graph,{focusId,selectedId,associativeOverlay});
 return assignIdentityColors(view);
}

function syncRenderer(){
 const view=currentView();
 renderer.setGraph(view);
 renderer.setSelected(selectedId);
 updateHud(view);
 updateSearch();
 updateControls(view);
 updateInspector();
 updateBreadcrumbs();
 updateDomainNav();
 updateRecorte();
 visualExperience?.updateGraph?.(view,{selectedId,focusId});
}

function updateHud(view){
 $('hud-nodes').textContent=String(view.nodes.length);
 $('hud-edges').textContent=String(view.edges.length);
 $('stage-nodes').textContent=String(view.nodes.length);
 $('stage-edges').textContent=String(view.edges.length);
 $('stage-source').textContent=showAlternativeFilaments?'SSOT + FILAMENTS':'SSOT';
}

function updateControls(view){
 $('expand-all').disabled=activeSection!=='graph';
 $('collapse-all').disabled=activeSection!=='graph';
 $('active-only').disabled=activeSection!=='graph';
 $('active-only').setAttribute('aria-pressed',String(activeOnly));
 $('filaments').setAttribute('aria-pressed',String(showAlternativeFilaments));
 const canOpen=Boolean(nodeById(selectedId)&&expandableIds().has(selectedId));
 $('open-node').hidden=!canOpen||activeSection!=='graph';
 $('open-node').disabled=!canOpen;
}

function updateSearch(){
 const input=$('hierarchy-search');
 const results=$('search-results');
 if(!input||!results)return;
 const q=String(input.value||'').trim().toLowerCase();
 if(!q){results.innerHTML='';results.hidden=true;return}
 const matches=graph.nodes.filter(node=>`${node.label||''} ${node.id||''}`.toLowerCase().includes(q)).slice(0,8);
 results.innerHTML='';
 for(const node of matches){
  const button=document.createElement('button');
  button.type='button';button.textContent=node.label||node.id;
  button.addEventListener('click',()=>{
   selectedId=node.id;
   const expanded=expandForSearch(graph,node.id,expandedIds);
   expandedIds=expanded.expandedIds;
   focusId=expanded.focusId||node.id;
   history.push(node.id);
   syncRenderer();
   visualExperience?.syncSelection?.(node);
   input.value='';results.hidden=true;
  });
  results.append(button);
 }
 results.hidden=!matches.length;
}

function updateInspector(){
 cockpit?.render?.({graph,currentGraph:currentView(),selectedId,focusId,activeSection,associativeOverlay,runtimeFacts:runtimeFacts()});
}

function updateBreadcrumbs(){
 const root=$('breadcrumbs');if(!root)return;root.innerHTML='';
 const trail=activeSection==='graph'?ancestorsOf(graph,selectedId||focusId):[{id:`section:${activeSection}`,label:activeSection.toUpperCase()}];
 for(const [index,node] of trail.entries()){
  if(index){const sep=document.createElement('span');sep.textContent='›';sep.className='breadcrumb-sep';root.append(sep)}
  const button=document.createElement('button');button.type='button';button.textContent=node.label||node.id;button.addEventListener('click',()=>selectNode(node.id));root.append(button);
 }
}

function updateDomainNav(){
 const root=$('domain-nav');if(!root)return;root.innerHTML='';
 for(const entry of domainLegend(graph)){
  const button=document.createElement('button');button.type='button';button.className='domain-nav-item';button.textContent=entry.label;button.dataset.domain=entry.domain;button.addEventListener('click',()=>{
   const node=graph.nodes.find(candidate=>candidate.id===entry.id||candidate.system===entry.domain&&candidate.hierarchyLevel==='lane');if(node)openNode(node.id);
  });root.append(button);
 }
}

function updateRecorte(){
 const list=$('recorte-list');if(!list)return;list.innerHTML='';
 for(const node of currentView().nodes.slice(0,24)){
  const button=document.createElement('button');button.type='button';button.textContent=node.label||node.id;button.addEventListener('click',()=>selectNode(node.id));list.append(button);
 }
}

function selectNode(id){
 const node=nodeById(id);if(!node)return;selectedId=id;focusId=id;syncRenderer();visualExperience?.syncSelection?.(node);
}
function openNode(id){
 const node=nodeById(id);if(!node)return;
 if(activeSection!=='graph'){selectedId=id;focusId=id;syncRenderer();return}
 if(expandableIds().has(id)){expandedIds=expandHierarchyNode(graph,id,expandedIds);selectedId=id;focusId=id;history.push(id);syncRenderer();visualExperience?.syncSelection?.(node)}else selectNode(id);
}
function goHome(){activeSection='graph';expandedIds=new Set();selectedId=graph.rootId;focusId=graph.rootId;history=[];syncRenderer();visualExperience?.syncSelection?.(nodeById(selectedId))}

const renderer=createGraphRenderer({
 root:rendererRoot,
 canvas:$('graph-lab-canvas'),
 rendererId,
 graph,currentGraph:currentView(),
 onSelect:id=>selectNode(id),
 onOpen:id=>openNode(id)
});
globalThis.__ATLAS_GRAPH_RENDERER=renderer;
const cockpit=createCockpit({root:$('cockpit'),getState:()=>({graph,currentGraph:currentView(),selectedId,focusId,activeSection,associativeOverlay,runtimeFacts:runtimeFacts()}),onOpen:openNode,onSelect:selectNode});
const visualExperience=installVisualExperienceV4({renderer,onSelectNode:selectNode,onOpenNode:openNode,onGoHome:goHome,onToggleFilaments:()=>{$('filaments').click()}});

$('hierarchy-search')?.addEventListener('input',updateSearch);
$('expand-all')?.addEventListener('click',()=>{expandedIds=new Set(expandableIds());syncRenderer()});
$('collapse-all')?.addEventListener('click',()=>{expandedIds=new Set();syncRenderer()});
$('active-only')?.addEventListener('click',()=>{activeOnly=!activeOnly;syncRenderer()});
$('filaments')?.addEventListener('click',()=>{showAlternativeFilaments=!showAlternativeFilaments;syncRenderer()});
$('open-node')?.addEventListener('click',()=>openNode(selectedId));
$('back')?.addEventListener('click',()=>{if(history.length>1){history.pop();selectNode(history.at(-1))}else goHome()});
$('home')?.addEventListener('click',goHome);
$('fit')?.addEventListener('click',()=>renderer.fit?.());
$('center')?.addEventListener('click',()=>renderer.center?.(selectedId));
$('zoom-in')?.addEventListener('click',()=>renderer.zoomBy?.(1.18));
$('zoom-out')?.addEventListener('click',()=>renderer.zoomBy?.(.84));
$('renderer')?.addEventListener('change',event=>{const url=rendererNavigationUrl(event.target.value,location.href);url.searchParams.set('experience',visualExperience?.state?.experienceId||params.get('experience')||'OPERATIONAL');location.assign(url.href)});

for(const button of document.querySelectorAll('[data-section]'))button.addEventListener('click',()=>{activeSection=button.dataset.section||'graph';for(const peer of document.querySelectorAll('[data-section]'))peer.classList.toggle('active',peer===button);syncRenderer()});

async function loadCanonical(){
 if(demoMode){baseGraph=graph;syncRenderer();return}
 try{
  const loaded=await loadSsotGraph();graph=loaded;baseGraph=loaded;selectedId=loaded.rootId;focusId=loaded.rootId;setBadge('SSOT LIVE · DRIVE',{openSsot:true,tone:'live'});
 }catch(error){
  try{const snapshot=await loadSsotSnapshot();graph=snapshot;baseGraph=snapshot;selectedId=snapshot.rootId;focusId=snapshot.rootId;setBadge('SSOT SNAPSHOT',{openSsot:true,tone:'stale'})}
  catch{setBadge('SSOT UNAVAILABLE',{openSsot:true,tone:'error'});console.error(error)}
 }
 syncRenderer();
 try{
  const token=++associativeLoadToken;const memory=await loadAssociativeMemory();if(token!==associativeLoadToken)return;associativeOverlay=memory;graph=mergeAssociativeOverlay(baseGraph,memory);syncRenderer();
 }catch{
  try{const token=++associativeLoadToken;const memory=await loadAssociativeSnapshot();if(token!==associativeLoadToken)return;associativeOverlay=memory;graph=mergeAssociativeOverlay(baseGraph,memory);syncRenderer()}catch{}
 }
}

syncRenderer();
loadCanonical();
