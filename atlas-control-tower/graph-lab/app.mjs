import {createSyntheticGraph} from './data/synthetic-graph.mjs';
import {loadSsotGraph,loadSsotSnapshot,SSOT_SPREADSHEET_URL} from './data/ssot.mjs';
import {isBindableRecordId} from './data/operations.mjs';
import {hierarchyView,expandForSearch,hierarchyExpandableIds,collapseSubtree,ancestorsOf} from './graph/projection.mjs';
import {assignIdentityColors,domainLegend} from './graph/identity.mjs';
import {GraphLabRenderer as ThreeCanvasRenderer} from './graph/renderer.mjs';
import {GraphLabRenderer as LegacyCanvasRenderer} from './graph/legacy-renderer.mjs';
import {createCockpit} from './cockpit.mjs';

const $=id=>document.getElementById(id);
const rendererRoot=$('graph-renderer-root');
const params=new URLSearchParams(location.search);
const demoMode=params.get('demo')==='1';

const placeholderGraph=()=>({rootId:'system:NEXO',nodes:[{id:'system:NEXO',label:'NEXO',type:'SYSTEM',kind:'SYSTEM',hierarchyLevel:'root',system:'NEXO',status:'LOADING',authority:'canonical',hiddenChildren:0,ops:{level:'root',status:'LOADING',tone:'idle',summary:'Lendo NEXO · SSOT CANONICAL.',rollup:{},sections:[]}}],edges:[]});

let graph=demoMode?createSyntheticGraph(50):placeholderGraph();
let expandedIds=new Set();
let selectedId=graph.rootId;
let focusId=graph.rootId;
let history=[];
let activeOnly=false;
let cockpitTab='visao';

const rendererMode=params.get('renderer')==='legacy-canvas'?'legacy-canvas':'three-canvas';
const Renderer=rendererMode==='legacy-canvas'?LegacyCanvasRenderer:ThreeCanvasRenderer;
const target=rendererMode==='legacy-canvas'?$('graph-lab-canvas'):rendererRoot;
$('renderer').value=rendererMode;
$('graph-lab-canvas').hidden=rendererMode!=='legacy-canvas';

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

// --- hierarchy state -------------------------------------------------------

const nodeById=id=>graph.nodes.find(node=>node.id===id)||null;
const expandableIds=()=>hierarchyExpandableIds(graph);

function currentView(){
 return hierarchyView(graph,{expandedIds,activeOnly,maxVisible:renderer.options.maxVisibleNodes});
}

function refresh({fit=false}={}){
 const view=currentView();
 if(!view.nodes.some(node=>node.id===focusId))focusId=graph.rootId;
 renderer.setGraph(view,{focusId,fit});
 renderer.setSelected?.(selectedId);
 renderView(view);
}

/** Readouts that describe the map itself rather than the selected node. */
function syncStage(view){
 $('stage-nodes').textContent=view.nodes.length;
 const source=graph.ops?.authority==='drive-ssot'?'SSOT LIVE':graph.ops?.authority?'SSOT PROJEÇÃO':'SSOT';
 $('stage-source').textContent=source;
 const blockers=graph.ops?.blockers?.length||0;
 const badge=$('rail-blockers');
 badge.textContent=blockers;
 badge.hidden=!blockers;
}

function renderFocusList(){
 const list=$('focus-list');
 list.replaceChildren();
 for(const domain of domainLegend(graph)){
  const button=document.createElement('button');
  button.type='button';
  const dot=document.createElement('i');
  dot.style.background=domain.hue;
  button.append(dot,document.createTextNode(domain.label));
  button.addEventListener('click',()=>{$('focus-menu').open=false;openNode(domain.id)});
  list.append(button);
 }
}

function renderView(view=currentView()){
 const node=nodeById(selectedId)||nodeById(graph.rootId);
 const projected=view.nodes.find(entry=>entry.id===node?.id);
 $('focus-label').textContent=node?.label||'NEXO';
 syncStage(view);
 renderBreadcrumb(node);
 cockpit.render(node,{
  graph,
  trail:node?ancestorsOf(graph,node.id).map(step=>({id:step.id,label:step.label})):[],
  tab:cockpitTab,
  expanded:expandedIds.has(node?.id),
  expandable:Boolean(projected?.expandable??(node&&expandableIds().has(node.id))),
  hiddenChildren:projected?.hiddenChildren??0
 });
}

function renderBreadcrumb(node){
 const root=$('breadcrumb');
 root.replaceChildren();
 const trail=node?ancestorsOf(graph,node.id):[];
 if(trail.length<2)return;
 trail.forEach((step,index)=>{
  if(index){const sep=document.createElement('span');sep.className='sep';sep.textContent='›';root.append(sep)}
  const button=document.createElement('button');
  button.type='button';
  button.textContent=step.label;
  if(step.id===node.id)button.className='is-current';
  button.addEventListener('click',()=>selectNode(step.id,{center:true}));
  root.append(button);
 });
}

function selectNode(id,{center=false}={}){
 if(!id)return;
 if(selectedId&&selectedId!==id)history.push(selectedId);
 selectedId=id;
 focusId=graph.rootId;
 renderer.setSelected?.(id);
 refresh();
 if(center)renderer.focusNode?.(id);
}

/** Single click is the whole navigation: it selects, and it opens or folds a subgraph. */
function toggleSubgraph(id){
 if(!expandableIds().has(id))return false;
 expandedIds=expandedIds.has(id)?collapseSubtree(graph,id,expandedIds):new Set([...expandedIds,id]);
 refresh();
 return true;
}

/** Reveals a node wherever it sits by opening every ancestor above it first. */
function openNode(id){
 const trail=ancestorsOf(graph,id);
 expandedIds=new Set([...expandedIds,...trail.slice(0,-1).map(step=>step.id)]);
 selectNode(id,{center:true});
}

// --- renderer --------------------------------------------------------------

const renderer=new Renderer(target,{
 onSelect:node=>{
  if(!node){selectedId=graph.rootId;refresh();return}
  if(selectedId!==node.id)history.push(selectedId);
  selectedId=node.id;
  if(!toggleSubgraph(node.id))refresh();
 },
 onOpen:node=>{if(node)toggleSubgraph(node.id)},
 onStats:stats=>{
  $('hud-fps').textContent=Number(stats.fps||0).toFixed(0);
  $('hud-frame').textContent=Number(stats.frameMs||0).toFixed(1);
  $('hud-nodes').textContent=stats.nodes;
  $('hud-edges').textContent=stats.edges;
  $('hud-labels').textContent=stats.labels;
  $('hud-dpr').textContent=Number(stats.dpr||1).toFixed(1);
 }
});

renderer.ready?.catch(error=>{
 console.error('[Atlas] WebGL renderer unavailable; switching to legacy canvas.',error);
 if(rendererMode==='legacy-canvas')return;
 const url=new URL(location.href);
 url.searchParams.set('renderer','legacy-canvas');
 url.searchParams.set('fallback','sigma-init');
 location.replace(url);
});

const cockpit=createCockpit($('cockpit-body'),{
 onFocusNode:id=>{openNode(id);openCockpit()},
 onToggleSubgraph:id=>{toggleSubgraph(id)},
 onHome:()=>goHome(),
 onTab:id=>setCockpitTab(id)
});

/** The rail is a shortcut into the cockpit tabs, not a second navigation tree. */
const railItems=[...document.querySelectorAll('.rail-item[data-tab]')];
function setCockpitTab(id,{open=false}={}){
 cockpitTab=id;
 for(const button of railItems)button.classList.toggle('is-active',button.dataset.tab===id);
 renderView();
 if(open)openCockpit();
}
for(const button of railItems)button.addEventListener('click',()=>setCockpitTab(button.dataset.tab,{open:true}));

// --- NEXO live -------------------------------------------------------------

function renderNexoLive(live=graph.live){
 const state=live?.loop||{};
 const setText=(id,value,fallback='—')=>{const node=$(id);if(node)node.textContent=value||fallback};
 setText('nexo-current-state',state.currentState,'Sem estado operacional projetado.');
 setText('nexo-next-action',state.nextAction);
 setText('nexo-last-effect',state.lastEffect);
 const renderList=(id,items,emptyText)=>{
  const root=$(id);
  if(!root)return;
  root.replaceChildren();
  if(!items?.length){const empty=document.createElement('span');empty.className='nexo-live-empty';empty.textContent=emptyText;root.append(empty);return}
  for(const item of items.slice(0,5)){
   const cited=new Set([item.recordId,item.scope,item.detail,...(item.evidenceRefs||[])].join(' ').split(/[^A-Za-z0-9_-]+/));
   const owner=graph.nodes.find(node=>isBindableRecordId(node.recordId)&&cited.has(node.recordId));
   const button=document.createElement('button');
   button.type='button';
   button.className='nexo-live-item';
   button.setAttribute('data-node-id',owner?.id||'');
   button.disabled=!owner;
   const top=document.createElement('span');
   top.className='nexo-live-item-top';
   const title=document.createElement('b');
   title.textContent=item.title||item.recordId;
   const status=document.createElement('em');
   status.textContent=item.status||'UNKNOWN';
   status.dataset.status=(item.status||'UNKNOWN').toLowerCase();
   top.append(title,status);
   const detail=document.createElement('small');
   detail.textContent=item.scope||item.effect||item.detail||item.recordId;
   button.append(top,detail);
   if(owner)button.addEventListener('click',()=>{openNode(owner.id);openCockpit()});
   root.append(button);
  }
 };
 renderList('nexo-mini-claims',live?.miniClaims,'Nenhuma mini-claim material.');
 renderList('nexo-engineering-effects',live?.engineeringEffects,'Nenhum efeito recente.');
}

// --- data ------------------------------------------------------------------

function setGraphData(next){
 graph=assignIdentityColors(next);
 expandedIds=new Set();
 selectedId=graph.rootId;
 focusId=graph.rootId;
 history=[];
 activeOnly=false;
 $('active-only').setAttribute('aria-pressed','false');
 $('active-only').classList.remove('is-active');
 $('hierarchy-search').value='';
 hideResults();
 renderNexoLive(graph.live);
 renderFocusList();
 refresh({fit:true});
}
function rebuild(count){if(demoMode)setGraphData(createSyntheticGraph(count))}

function goHome(){
 expandedIds=new Set();
 selectedId=graph.rootId;
 focusId=graph.rootId;
 refresh({fit:true});
}

// --- search ----------------------------------------------------------------

const results=$('search-results');
const searchInput=$('hierarchy-search');
function hideResults(){results.hidden=true;results.replaceChildren();searchInput.setAttribute('aria-expanded','false')}
function showResults(matches){
 results.replaceChildren();
 if(!matches.length){hideResults();return}
 for(const match of matches){
  const item=document.createElement('li');
  const button=document.createElement('button');
  button.type='button';
  const label=document.createElement('b');
  label.textContent=match.label;
  const meta=document.createElement('small');
  meta.textContent=`${String(match.hierarchyLevel||'').toUpperCase()} · ${match.recordId||match.id}`;
  button.append(label,meta);
  button.addEventListener('click',()=>{searchInput.value=match.label;hideResults();openNode(match.id);openCockpit()});
  item.append(button);
  results.append(item);
 }
 results.hidden=false;
 searchInput.setAttribute('aria-expanded','true');
}

searchInput.addEventListener('input',event=>{
 const query=event.target.value.trim();
 if(!query){hideResults();return}
 const result=expandForSearch(graph,query,expandedIds);
 showResults(result.matches);
});
searchInput.addEventListener('keydown',event=>{
 if(event.key==='Escape'){searchInput.value='';hideResults();return}
 if(event.key!=='Enter')return;
 const result=expandForSearch(graph,searchInput.value,expandedIds);
 if(!result.matchId)return;
 expandedIds=result.expandedIds;
 hideResults();
 selectNode(result.matchId,{center:true});
 openCockpit();
});
$('hierarchy-search-clear').addEventListener('click',()=>{searchInput.value='';hideResults();searchInput.focus()});
document.addEventListener('click',event=>{if(!results.hidden&&!event.target.closest('.topbar-search'))hideResults()});

// --- controls --------------------------------------------------------------

$('expand-all').addEventListener('click',()=>{expandedIds=expandableIds();refresh()});
$('collapse-all').addEventListener('click',()=>{expandedIds=new Set();refresh({fit:true})});
$('home').addEventListener('click',()=>goHome());
$('active-only').addEventListener('click',event=>{
 activeOnly=!activeOnly;
 event.currentTarget.setAttribute('aria-pressed',String(activeOnly));
 event.currentTarget.classList.toggle('is-active',activeOnly);
 refresh();
});
$('back').addEventListener('click',()=>{if(history.length){selectedId=history.pop();refresh();renderer.focusNode?.(selectedId)}});
$('motion').addEventListener('click',event=>{
 renderer.setOptions({autoOrbit:!renderer.options.autoOrbit});
 event.currentTarget.setAttribute('aria-pressed',String(renderer.options.autoOrbit));
 event.currentTarget.textContent=renderer.options.autoOrbit?'Ⅱ':'▷';
});
$('zoom-in').addEventListener('click',()=>renderer.zoom(1.18));
$('zoom-out').addEventListener('click',()=>renderer.zoom(.85));
$('fit').addEventListener('click',()=>renderer.fit());
$('center').addEventListener('click',()=>renderer.centerSelected());
$('flat').addEventListener('click',event=>{event.currentTarget.textContent=renderer.toggleFlat()?'3D':'2D'});

const liveSurface=$('nexo-live');
$('nexo-live-toggle').addEventListener('click',event=>{const open=liveSurface.classList.toggle('is-open');event.currentTarget.setAttribute('aria-expanded',String(open))});

const cockpitPanel=$('cockpit');
const openCockpit=()=>cockpitPanel.classList.add('open');
$('cockpit-toggle').addEventListener('click',()=>cockpitPanel.classList.toggle('open'));
$('cockpit-close').addEventListener('click',()=>cockpitPanel.classList.remove('open'));

const labPanel=$('lab-panel');
$('panel-toggle').addEventListener('click',()=>labPanel.classList.toggle('open'));
$('panel-close').addEventListener('click',()=>labPanel.classList.remove('open'));

$('renderer').addEventListener('change',event=>{
 const url=new URL(location.href);
 url.searchParams.set('renderer',event.target.value);
 url.searchParams.delete('fallback');
 location.assign(url);
});
$('preset').addEventListener('change',event=>{renderer.setPreset(event.target.value);syncControls();refresh()});
dataset.addEventListener('change',event=>rebuild(Number(event.target.value)));

const SLIDERS=[['node-radius','nodeRadius'],['glow','glow'],['fog','fog'],['perspective','focalLength'],['drift','drift'],['pulse-speed','pulseSpeed'],['filament-curve','filamentCurve'],['max-labels','maxLabels'],['max-visible','maxVisibleNodes']];
const decimals=id=>['perspective','max-labels','max-visible'].includes(id)?0:id==='drift'?1:2;
function syncControls(){
 for(const [id,key] of SLIDERS){
  const input=$(id);
  if(!input||renderer.options[key]==null)continue;
  input.value=renderer.options[key];
  $(`${id}-out`).textContent=Number(renderer.options[key]).toFixed(decimals(id));
 }
}
for(const [id,key] of SLIDERS)$(id).addEventListener('input',event=>{
 const value=Number(event.target.value);
 renderer.setOptions({[key]:value});
 $(`${id}-out`).textContent=value.toFixed(decimals(id));
 if(key==='maxVisibleNodes')refresh();
});

// --- boot ------------------------------------------------------------------

renderer.setPreset(matchMedia('(max-width:760px)').matches?'MOBILE':'ORIGINAL');
syncControls();
renderNexoLive(graph.live);
refresh({fit:true});
renderer.start();

if(!demoMode){
 loadSsotGraph().then(next=>{
  setGraphData(next);
  setBadge(`SSOT LIVE · DRIVE · ${next.ops.counts.domains}D · ${next.ops.counts.programs}P · ${next.ops.counts.campaigns}C`,{openSsot:true,tone:next.ops.loopBlocked?'blocked':'ok'});
 }).catch(async liveError=>{
  console.warn('[Atlas] Direct private Drive read blocked; using synchronized SSOT projection.',liveError);
  try{
   const next=await loadSsotSnapshot();
   setGraphData(next);
   setBadge(`SSOT SNAPSHOT · DRIVE · ${next.ops.counts.domains}D · ${next.ops.counts.programs}P · ${next.ops.counts.campaigns}C`,{openSsot:true,tone:next.ops.loopBlocked?'blocked':'warn'});
  }catch(snapshotError){
   console.error('[Atlas] Drive SSOT and synchronized snapshot unavailable.',snapshotError);
   setBadge('SSOT UNAVAILABLE · OPEN DRIVE',{openSsot:true,tone:'blocked'});
   $('focus-label').textContent='SSOT OFFLINE';
  }
 });
}
