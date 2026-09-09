import {EXPERIENCE_ORDER,EXPERIENCE_PRESETS} from './experience-presets.mjs';
import {resolveExperience} from './resolve-experience.mjs';
import {applyBackgroundState,domainFromNode,resolveBackground} from '../background/background-director.mjs';
import {RENDERERS} from '../renderers/renderer-registry.mjs';

const STORAGE_KEY='nexo-atlas-experience-v4';
const $=selector=>document.querySelector(selector);
const byId=id=>document.getElementById(id);
const isMobile=()=>matchMedia('(max-width:760px)').matches;

function read(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{}}catch{return {}}}
function write(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value))}catch{}}
function rendererIdFromPage(){
 const requested=globalThis.__ATLAS_RENDERER_REQUESTED;
 if(requested&&RENDERERS[requested])return requested;
 const value=byId('renderer')?.value;
 return value==='three-canvas'?'three-25d':'canvas-2d';
}
function ensureCss(){
 if(document.querySelector('link[data-atlas-experience-v4]'))return;
 const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./visual-experience-v4.css',import.meta.url).href;link.dataset.atlasExperienceV4='';document.head.append(link);
}
function setButtonActive(root,value){for(const button of root?.querySelectorAll('[data-experience]')||[])button.classList.toggle('is-active',button.dataset.experience===value)}
function copyText(value){return navigator.clipboard?.writeText?.(value).catch(()=>{})}

export function installVisualExperienceV4({renderer,onOpenNode,onGoHome,onToggleFilaments}={}){
 if(!renderer||renderer.__atlasVisualExperienceV4)return renderer?.__atlasVisualExperienceV4;
 ensureCss();
 const query=new URLSearchParams(location.search);
 const saved=read();
 const state={
  experienceId:query.get('experience')||saved.experienceId||(isMobile()?'MOBILE_CLEAN':'EXECUTIVE_DEMO'),
  rendererId:query.get('renderer-v4')||saved.rendererId||rendererIdFromPage(),
  domain:'NEXO',filaments:false,demo:query.get('demo-view')==='1'||saved.demo===true,
  graph:{nodes:[],edges:[]},background:null,profile:null
 };
 if(!EXPERIENCE_PRESETS[state.experienceId])state.experienceId=isMobile()?'MOBILE_CLEAN':'EXECUTIVE_DEMO';

 const originalSetGraph=renderer.setGraph?.bind(renderer);
 const originalSetSelected=renderer.setSelected?.bind(renderer);
 const originalSetTheme=renderer.setTheme?.bind(renderer);
 const originalDrawSpace=renderer.drawSpace?.bind(renderer);
 let selectedId=null;

 function activeNode(){return state.graph.nodes?.find(node=>node.id===selectedId)||state.graph.nodes?.find(node=>node.id===state.graph.rootId)||null}
 function background(){
  const theme=document.documentElement.dataset.theme||state.profile?.theme||'dark';
  const next=resolveBackground({theme,rendererId:state.rendererId,activeDomain:state.domain,graphDensity:state.graph.nodes?.length||0,filamentMode:state.filaments?'all':'off',viewport:state.profile?.viewport});
  state.background=applyBackgroundState(next);
  renderer.referenceBackgroundCacheKey='';
  renderer.invalidate?.();
  renderer.render?.();
  return next;
 }
 function syncDomain(node=activeNode()){
  state.domain=domainFromNode(node);
  document.documentElement.setAttribute('data-atlas-domain',state.domain);
  for(const button of document.querySelectorAll('[data-domain-target]'))button.classList.toggle('is-active',button.dataset.domainTarget===state.domain);
  background();
 }
 function applyProfile(experienceId=state.experienceId,{persist=true}={}){
  state.experienceId=EXPERIENCE_PRESETS[experienceId]?experienceId:'OPERATIONAL';
  const explicitRenderer=query.get('renderer-v4')||saved.rendererId||state.rendererId;
  state.profile=resolveExperience({experienceId:state.experienceId,width:innerWidth,theme:document.documentElement.dataset.theme||undefined,rendererOverride:explicitRenderer});
  state.rendererId=state.profile.rendererId;
  state.filaments=state.profile.filamentMode!=='off';
  document.documentElement.dataset.atlasExperience=state.experienceId;
  document.documentElement.dataset.atlasRenderer=state.rendererId;
  const preset=state.profile.rendererPreset;
  if(preset)renderer.setPreset?.(preset);
  renderer.setOptions?.({
   layoutSpacing:state.profile.layoutSpacing,fitPadding:state.profile.fitPadding,labelScale:state.profile.labelScale,
   maxLabels:state.profile.maxLabels,maxVisibleNodes:state.profile.maxVisibleNodes,drift:state.profile.drift,pulseSpeed:state.profile.pulseSpeed
  });
  onToggleFilaments?.(state.filaments);
  setButtonActive(document,state.experienceId);
  const select=byId('atlas-experience-select');if(select)select.value=state.experienceId;
  if(persist)write({experienceId:state.experienceId,rendererId:state.rendererId,demo:state.demo});
  background();
  return state.profile;
 }

 renderer.setGraph=function(graph,options){state.graph=graph||{nodes:[],edges:[]};const result=originalSetGraph?.(graph,options);syncStatus();syncDomain(activeNode());return result};
 renderer.setSelected=function(id){selectedId=id;const result=originalSetSelected?.(id);syncDomain(activeNode());return result};
 renderer.setTheme=function(theme){const result=originalSetTheme?.(theme);queueMicrotask(background);return result};
 if(originalDrawSpace){
  renderer.drawSpace=function(ctx,w,h){
   originalDrawSpace(ctx,w,h);
   const s=state.background||background();
   const g=ctx.createRadialGradient(w*.5,h*.48,0,w*.5,h*.48,Math.max(w,h)*.48);
   g.addColorStop(0,`rgba(${s.primaryRgb},${s.domainAura*.12})`);g.addColorStop(.42,`rgba(${s.secondaryRgb},${s.focusHalo*.055})`);g.addColorStop(1,'rgba(0,0,0,0)');
   ctx.save();ctx.globalCompositeOperation=s.theme==='light'?'multiply':'screen';ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.restore();
  };
 }

 function syncStatus(){
  const root=byId('atlas-status-summary');if(!root)return;
  const nodes=state.graph.nodes||[];
  const macro=nodes.filter(node=>node.hierarchyLevel==='lane').length;
  const blockers=nodes.filter(node=>String(node.status||'').toUpperCase().includes('BLOCK')).length;
  const visible=nodes.length;
  root.querySelector('[data-metric=domains] b').textContent=String(macro||3);
  root.querySelector('[data-metric=nodes] b').textContent=String(visible);
  root.querySelector('[data-metric=blockers] b').textContent=String(blockers);
 }
 function makeButton(label,attrs={}){const b=document.createElement('button');b.type='button';b.textContent=label;for(const [k,v] of Object.entries(attrs))b.dataset[k]=v;return b}
 function installDomainBar(){
  const stage=$('.stage');if(!stage||byId('atlas-experience-bar'))return;
  const bar=document.createElement('nav');bar.id='atlas-experience-bar';bar.className='atlas-experience-bar';bar.setAttribute('aria-label','Domínios e experiências Atlas');
  const targets=[['NEXO','NEXO','atlas-domain-nexo'],['CIÊNCIA','SCIENCE','atlas-domain-science'],['OLYMPUS','OLYMPUS','atlas-domain-olympus'],['ENGENHARIA','ENGINEERING','atlas-domain-engineering']];
  for(const [label,domain,klass] of targets){const b=makeButton(label,{domainTarget:domain});b.classList.add(klass);b.addEventListener('click',()=>domain==='NEXO'?onGoHome?.():onOpenNode?.(`lane:${domain}`));bar.append(b)}
  const filament=makeButton('FILAMENTOS');filament.className='atlas-filaments-toggle';filament.addEventListener('click',()=>{state.filaments=!state.filaments;filament.classList.toggle('is-active',state.filaments);onToggleFilaments?.(state.filaments);background()});bar.append(filament);
  stage.append(bar);
 }
 function installStatus(){
  const stage=$('.stage');if(!stage||byId('atlas-status-summary'))return;
  const root=document.createElement('div');root.id='atlas-status-summary';root.className='atlas-status-summary';root.innerHTML='<span data-metric="domains"><b>3</b><small>Macro-domínios</small></span><span data-metric="nodes"><b>0</b><small>Nós visíveis</small></span><span data-metric="blockers"><b>0</b><small>Bloqueios</small></span>';
  stage.append(root);syncStatus();
 }
 function installTopActions(){
  const tools=$('.topbar-tools');if(!tools||byId('atlas-demo-toggle'))return;
  const demo=makeButton('DEMO');demo.id='atlas-demo-toggle';demo.className='atlas-top-action';demo.addEventListener('click',()=>setDemo(!state.demo));
  const share=makeButton('SHARE VIEW');share.id='atlas-share-view';share.className='atlas-top-action';share.addEventListener('click',()=>{
   const url=new URL(location.href);url.searchParams.set('experience',state.experienceId);url.searchParams.set('renderer-v4',state.rendererId);url.searchParams.set('theme',document.documentElement.dataset.theme||'dark');if(state.demo)url.searchParams.set('demo-view','1');else url.searchParams.delete('demo-view');copyText(url.href);share.textContent='COPIED';setTimeout(()=>share.textContent='SHARE VIEW',1200);
  });
  tools.prepend(share);tools.prepend(demo);setDemo(state.demo,{persist:false});
 }
 function setDemo(value,{persist=true}={}){
  state.demo=Boolean(value);document.documentElement.dataset.demoMode=String(state.demo);byId('atlas-demo-toggle')?.classList.toggle('atlas-demo-active',state.demo);byId('atlas-demo-toggle')?.setAttribute('aria-pressed',String(state.demo));if(persist)write({experienceId:state.experienceId,rendererId:state.rendererId,demo:state.demo});
 }
 function installStudio(){
  const panel=byId('lab-panel');const hud=panel?.querySelector('.hud');if(!panel||!hud||byId('atlas-experience-studio'))return;
  const root=document.createElement('section');root.id='atlas-experience-studio';root.className='atlas-experience-studio';
  root.innerHTML='<header><b>EXPERIENCE STUDIO</b><small>produto primeiro · sliders depois</small></header><label class="select-row">Experience<select id="atlas-experience-select"></select></label><div class="atlas-experience-grid"></div><div class="section-title">Renderer roadmap</div><div class="atlas-renderer-matrix"></div>';
  hud.after(root);
  const select=root.querySelector('select'),grid=root.querySelector('.atlas-experience-grid');
  for(const id of EXPERIENCE_ORDER){const p=EXPERIENCE_PRESETS[id];const option=document.createElement('option');option.value=id;option.textContent=p.label;select.append(option);const b=makeButton('');b.dataset.experience=id;b.innerHTML=`<b>${p.label}</b><small>${p.rendererId} · ${p.backgroundPreset}</small>`;b.addEventListener('click',()=>applyProfile(id));grid.append(b)}
  select.addEventListener('change',()=>applyProfile(select.value));
  const matrix=root.querySelector('.atlas-renderer-matrix');for(const rendererInfo of Object.values(RENDERERS)){const b=makeButton('');b.dataset.ready=String(rendererInfo.availability==='ready');b.innerHTML=`${rendererInfo.label}<em>${rendererInfo.availability}</em>`;if(rendererInfo.availability==='ready')b.addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.set('renderer-v4',rendererInfo.id);url.searchParams.set('renderer',rendererInfo.baseRenderer);location.assign(url)});matrix.append(b)}
 }
 function boot(){installDomainBar();installStatus();installTopActions();installStudio();applyProfile(state.experienceId,{persist:false});syncDomain(activeNode())}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
 addEventListener('resize',()=>{const next=resolveExperience({experienceId:state.experienceId,width:innerWidth,theme:document.documentElement.dataset.theme||undefined,rendererOverride:state.rendererId});if(next.viewport!==state.profile?.viewport){state.profile=next;applyProfile(state.experienceId,{persist:false})}},{passive:true});

 const api={state,applyExperience:applyProfile,setDemo,refreshBackground:background,syncDomain};
 renderer.__atlasVisualExperienceV4=api;globalThis.__ATLAS_VISUAL_EXPERIENCE=api;return api;
}
