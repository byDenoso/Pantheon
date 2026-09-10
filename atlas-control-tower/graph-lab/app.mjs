import {createSyntheticGraph} from './data/synthetic-graph.mjs';
import {loadSsotGraph,loadSsotSnapshot,SSOT_SPREADSHEET_URL} from './data/ssot.mjs';
import {isBindableRecordId} from './data/operations.mjs';
import {hierarchyView,expandForSearch,hierarchyExpandableIds,collapseSubtree,expandHierarchyNode,ancestorsOf} from './graph/projection.mjs';
import {assignIdentityColors,domainLegend} from './graph/identity.mjs';
import {buildSectionGraph,ATLAS_SECTIONS} from './graph/section-views.mjs';
import './graph/canvas-reference-background.mjs';
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
 if(activeSection==='graph')return hierarchyView(graph,{expandedIds,activeOnly,maxVisible:renderer.options.maxVisibleNodes,showAlternativeFilaments});
 return buildSectionGraph(graph,activeSection,runtimeFacts());
}

function refresh({fit=false}={}){
 const view=currentView();
 if(!view.nodes.some(node=>node.id===focusId))focusId=view.rootId||graph.rootId;
 if(!view.nodes.some(node=>node.id===selectedId))selectedId=view.rootId||graph.rootId;
 renderer.setGraph(view,{focusId,fit});
 renderer.setSelected?.(selectedId);
 renderView(view);
}

/** Readouts that describe the map itself rather than the selected node. */
function syncStage(view){
 $('stage-nodes').textContent=view.nodes.length;
 const source=graph.ops?.authority==='drive-ssot'?'SSOT LIVE':graph.ops?.authority?'SSOT PROJEÇÃO':'SSOT';
 $('stage-source').textContent=activeSection==='graph'?source:activeSection.toUpperCase();
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
 const node=view.nodes.find(entry=>entry.id===selectedId)||nodeById(selectedId)||view.nodes.find(entry=>entry.id===view.rootId)||nodeById(graph.rootId);
 const canonical=nodeById(node?.id);
 const projected=view.nodes.find(entry=>entry.id===node?.id);
 $('focus-label').textContent=node?.label||'NEXO';
 syncStage(view);
 if(activeSection==='graph')renderBreadcrumb(canonical||node);else $('breadcrumb').replaceChildren();
 cockpit.render(node,{
  graph:activeSection==='graph'?graph:view,
  trail:activeSection==='graph'&&canonical?ancestorsOf(graph,canonical.id).map(step=>({id:step.id,label:step.label})):[],
  tab:cockpitTab,
  expanded:activeSection==='graph'&&expandedIds.has(node?.id),
  expandable:activeSection==='graph'&&Boolean(projected?.expandable??(canonical&&expandableIds().has(canonical.id))),
  hiddenChildren:activeSection==='graph'?(projected?.hiddenChildren??0):0
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
 focusId=currentView().rootId||graph.rootId;
 renderer.setSelected?.(id);
 if(activeSection==='graph')refresh();else renderView(currentView());
 if(center)renderer.focusNode?.(id);
}

/** Single click is the whole hierarchy navigation only in Graph Lab. */
function toggleSubgraph(id){
 if(activeSection!=='graph'||!expandableIds().has(id))return false;
 expandedIds=expandedIds.has(id)?collapseSubtree(graph,id,expandedIds):expandHierarchyNode(graph,id,expandedIds);
 refresh();
 return true;
}

/** Reveals a canonical node by switching back to Graph Lab and opening its ancestors. */
function openNode(id){
 const canonical=nodeById(id);
 if(!canonical){selectedId=id;renderer.setSelected?.(id);renderView(currentView());return}
 if(activeSection!=='graph')setSection('graph',{fit:false});
 if(canonical.hierarchyLevel==='lane')expandedIds=expandHierarchyNode(graph,id,expandedIds);
 else{
  const trail=ancestorsOf(graph,id);
  expandedIds=new Set([...expandedIds,...trail.slice(0,-1).map(step=>step.id)]);
 }
 selectNode(id,{center:true});
}

// --- renderer --------------------------------------------------------------

const renderer=createGraphRenderer({
 id:rendererId,
 canvas:$('graph-lab-canvas'),
 container:rendererRoot,
 mobile:mobileViewport(),
 callbacks:{
 onSelect:node=>{
  if(activeSection!=='graph'){
   selectedId=node?.id||currentView().rootId||graph.rootId;
   renderer.setSelected?.(selectedId);
   renderView(currentView());
   return;
  }
  if(!node){selectedId=graph.rootId;refresh();return}
  selectNode(node.id,{center:false});
 },
 onOpen:node=>{if(node&&activeSection==='graph')toggleSubgraph(node.id)},
 onStats:stats=>{
  $('hud-fps').textContent=Number(stats.fps||0).toFixed(0);
  $('hud-frame').textContent=Number(stats.frameMs||0).toFixed(1);
  $('hud-nodes').textContent=stats.nodes;
  $('hud-edges').textContent=stats.edges;
  $('hud-labels').textContent=stats.labels;
  $('hud-dpr').textContent=Number(stats.dpr||1).toFixed(1);
 }
 }});

renderer.ready?.catch(error=>{
 console.error('[Atlas] WebGL renderer unavailable; switching to legacy canvas.',error);
 if(rendererId==='canvas-2d'||rendererId==='canvas-25d')return;
 const url=new URL(location.href);
 url.searchParams.set('renderer-v4','canvas-2d');
 url.searchParams.set('renderer','legacy-canvas');
 url.searchParams.set('fallback','renderer-init');
 location.replace(url);
});

const cockpit=createCockpit($('cockpit-body'),{
 onFocusNode:id=>{openNode(id);openCockpit()},
 onToggleSubgraph:id=>{toggleSubgraph(id)},
 onHome:()=>goHome(),
 onTab:id=>setCockpitTab(id)
});

const visualExperience=installVisualExperienceV4({
 renderer,
 onSelectNode:id=>selectNode(id,{center:false}),
 onOpenNode:openNode,
 onGoHome:goHome,
 onToggleFilaments:value=>{showAlternativeFilaments=Boolean(value);refresh()}
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
 showAlternativeFilaments=Boolean(visualExperience?.state?.filaments);
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
 setSection('graph',{fit:true});
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
 if(activeSection!=='graph')setSection('graph',{fit:false});
 selectNode(result.matchId,{center:true});
 openCockpit();
});
$('hierarchy-search-clear').addEventListener('click',()=>{searchInput.value='';hideResults();searchInput.focus()});
document.addEventListener('click',event=>{if(!results.hidden&&!event.target.closest('.topbar-search'))hideResults()});

// --- controls --------------------------------------------------------------

$('expand-all').addEventListener('click',()=>{if(activeSection!=='graph')setSection('graph',{fit:false});expandedIds=expandableIds();refresh()});
$('collapse-all').addEventListener('click',()=>{if(activeSection!=='graph')setSection('graph',{fit:false});expandedIds=new Set();refresh({fit:true})});
$('home').addEventListener('click',()=>goHome());
$('active-only').addEventListener('click',event=>{
 if(activeSection!=='graph')setSection('graph',{fit:false});
 activeOnly=!activeOnly;
 event.currentTarget.setAttribute('aria-pressed',String(activeOnly));
 event.currentTarget.classList.toggle('is-active',activeOnly);
 refresh();
});
$('back').addEventListener('click',()=>{if(history.length){selectedId=history.pop();if(activeSection==='graph')refresh();else{renderer.setSelected?.(selectedId);renderView(currentView())}renderer.focusNode?.(selectedId)}});
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
$('cockpit-toggle').addEventListener('click',event=>{
 if(document.documentElement.dataset.cockpitMode==='hidden')return;
 cockpitPanel.classList.toggle('open');
 event.stopImmediatePropagation();
});
$('cockpit-close').addEventListener('click',()=>cockpitPanel.classList.remove('open'));

const labPanel=$('lab-panel');
$('panel-toggle').addEventListener('click',()=>labPanel.classList.toggle('open'));
$('panel-close').addEventListener('click',()=>labPanel.classList.remove('open'));

const navLinks=[...document.querySelectorAll('.topbar-nav a')];
const sectionFromLink=link=>link.getAttribute('href')==='#graph-stage'?'graph':String(link.getAttribute('href')||'').replace(/^#/,'');
function setSection(section,{fit=true,updateHash=true}={}){
 const next=ATLAS_SECTIONS.includes(section)?section:'graph';
 activeSection=next;
 selectedId=graph.rootId;
 focusId=graph.rootId;
 history=[];
 document.documentElement.dataset.atlasSection=next;
 for(const link of navLinks)link.classList.toggle('is-active',sectionFromLink(link)===next);
 if(next==='settings')labPanel.classList.add('open');else labPanel.classList.remove('open');
 refresh({fit});
 if(updateHash)globalThis.history?.replaceState?.(null,'',next==='graph'?'#graph-stage':`#${next}`);
}
for(const link of navLinks)link.addEventListener('click',event=>{
 event.preventDefault();
 setSection(sectionFromLink(link),{fit:true});
});

$('renderer').addEventListener('change',event=>{
 location.assign(rendererNavigationUrl(event.target.value,location.href).href);
});
$('preset').addEventListener('change',event=>{
 renderer.setPreset(event.target.value);
 renderer.setTheme?.(document.documentElement.dataset.theme||'dark');
 syncControls();
 refresh();
});
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
 if(key==='maxVisibleNodes'||activeSection==='settings')refresh();
});

const themeObserver=typeof MutationObserver==='function'?new MutationObserver(records=>{
 if(!records.some(record=>record.attributeName==='data-theme'))return;
 renderer.setTheme?.(document.documentElement.dataset.theme||'dark');
 visualExperience?.refreshBackground?.();
 if(activeSection==='settings')refresh();else renderer.invalidate?.();
}):null;
themeObserver?.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

// --- boot ------------------------------------------------------------------

renderer.setPreset(matchMedia('(max-width:760px)').matches?'MOBILE':'ORIGINAL');
renderer.setTheme?.(document.documentElement.dataset.theme||'dark');
syncControls();
renderNexoLive(graph.live);
setSection(activeSection,{fit:true,updateHash:false});
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
