const MOBILE_QUERY='(max-width:760px)';
const isMobile=()=>typeof matchMedia==='function'&&matchMedia(MOBILE_QUERY).matches;
const byId=id=>document.getElementById(id);

function ensureCss(){
 if(document.querySelector('link[data-atlas-mobile-v6]'))return;
 const link=document.createElement('link');
 link.rel='stylesheet';
 link.href=new URL('./mobile-ui-v6.css',import.meta.url).href;
 link.dataset.atlasMobileV6='';
 document.head.append(link);
}

function button(label,{className='',ariaLabel=label}={}){
 const node=document.createElement('button');
 node.type='button';
 node.className=className;
 node.textContent=label;
 node.setAttribute('aria-label',ariaLabel);
 return node;
}

function clickControl(id){byId(id)?.click()}
function currentExperience(explicit){return explicit||globalThis.__ATLAS_VISUAL_EXPERIENCE||null}
function proxyDomain(domain,{onGoHome,onOpenNode,nodeId}={}){
 if(domain==='NEXO'){
  if(onGoHome)return onGoHome();
  return clickControl('home');
 }
 if(onOpenNode)return onOpenNode(nodeId);
 document.querySelector(`#atlas-experience-bar [data-domain-target="${domain}"]`)?.click();
}

export function installMobileUxV6({renderer,visualExperience,onGoHome,onOpenNode}={}){
 ensureCss();
 const stage=document.querySelector('.stage');
 const cockpit=byId('cockpit');
 if(!stage||!cockpit)return{sync(){},destroy(){},setCockpitSheetState(){}};
 if(globalThis.__ATLAS_MOBILE_UX_V6)return globalThis.__ATLAS_MOBILE_UX_V6;

 let sheetState='closed';
 let rendererSuspended=false;
 let lastTrigger=null;
 let mutatingSheet=false;

 const nav=document.createElement('nav');
 nav.id='atlas-mobile-nav';
 nav.className='atlas-mobile-nav';
 nav.setAttribute('aria-label','Navegação principal do Atlas');
 nav.setAttribute('data-label-reserved','');
 const targets=[
  ['NEXO','NEXO','system:NEXO'],
  ['CIÊNCIA','SCIENCE','lane:SCIENCE'],
  ['OLYMPUS','OLYMPUS','lane:OLYMPUS'],
  ['ENGENHARIA','ENGINEERING','lane:ENGINEERING']
 ];
 for(const [label,domain,nodeId] of targets){
  const item=button(label,{ariaLabel:`Abrir ${label}`});
  item.dataset.domainTarget=domain;
  item.addEventListener('click',()=>proxyDomain(domain,{onGoHome,onOpenNode,nodeId}));
  nav.append(item);
 }
 const filaments=button('FILAMENTOS',{ariaLabel:'Mostrar filamentos de aprendizagem'});
 filaments.className='atlas-mobile-filaments';
 filaments.setAttribute('aria-pressed','false');
 const filamentCount=document.createElement('small');
 filamentCount.dataset.filamentCount='';
 filaments.append(filamentCount);
 filaments.addEventListener('click',()=>{
  document.querySelector('#atlas-experience-bar .atlas-filaments-toggle')?.click();
  queueMicrotask(sync);
 });
 nav.append(filaments);
 stage.append(nav);

 const tools=document.createElement('div');
 tools.className='atlas-mobile-tools';
 tools.setAttribute('aria-label','Controles do mapa');
 const back=button('←',{ariaLabel:'Voltar'});back.addEventListener('click',()=>clickControl('back'));
 const fit=button('⊞',{ariaLabel:'Enquadrar mapa'});fit.addEventListener('click',()=>renderer?.fit?.());
 const center=button('◎',{ariaLabel:'Centralizar seleção'});center.addEventListener('click',()=>renderer?.centerSelected?.());
 const more=document.createElement('details');
 const summary=document.createElement('summary');summary.textContent='•••';summary.setAttribute('aria-label','Mais controles');
 const moreList=document.createElement('div');moreList.className='atlas-mobile-more-list';
 for(const [label,id] of [['Zoom −','zoom-out'],['Zoom +','zoom-in'],['Movimento','motion'],['Plano 2D/3D','flat'],['Visual e renderer','panel-toggle']]){
  const item=button(label);item.addEventListener('click',()=>{more.open=false;clickControl(id)});moreList.append(item);
 }
 more.append(summary,moreList);tools.append(back,fit,center,more);stage.append(tools);

 const cockpitToggle=byId('cockpit-toggle');
 const cockpitClose=byId('cockpit-close');
 const bar=cockpit.querySelector('.cockpit-bar');
 const sheetToggle=button('⌃',{className:'cockpit-sheet-toggle',ariaLabel:'Expandir cockpit'});
 sheetToggle.id='cockpit-sheet-toggle';
 sheetToggle.setAttribute('aria-controls','cockpit-body');
 bar?.insertBefore(sheetToggle,cockpitClose||null);
 cockpit.setAttribute('role','dialog');
 cockpit.setAttribute('aria-label','Contexto operacional');
 cockpit.setAttribute('aria-modal','false');
 cockpitToggle?.setAttribute('aria-controls','cockpit');
 cockpitClose?.setAttribute('aria-label','Fechar cockpit');
 byId('panel-toggle')?.setAttribute('aria-controls','lab-panel');
 byId('lab-panel')?.setAttribute('role','dialog');
 byId('lab-panel')?.setAttribute('aria-label','Configurações visuais do Atlas');

 function setCockpitSheetState(next,{restoreFocus=false}={}){
  if(!isMobile())return next;
  const state=['closed','compact','expanded'].includes(next)?next:'compact';
  mutatingSheet=true;
  sheetState=state;
  cockpit.dataset.sheetState=state;
  cockpit.classList.toggle('open',state!=='closed');
  cockpitToggle?.setAttribute('aria-expanded',String(state!=='closed'));
  sheetToggle.setAttribute('aria-expanded',String(state==='expanded'));
  sheetToggle.textContent=state==='expanded'?'⌄':'⌃';
  sheetToggle.setAttribute('aria-label',state==='expanded'?'Recolher cockpit':'Expandir cockpit');
  if(state==='expanded'&&!rendererSuspended){renderer?.stop?.();rendererSuspended=true}
  if(state!=='expanded'&&rendererSuspended){renderer?.start?.();rendererSuspended=false}
  queueMicrotask(()=>{mutatingSheet=false});
  if(state==='closed'&&restoreFocus)lastTrigger?.focus?.();
  return state;
 }

 function openCompact(trigger){lastTrigger=trigger||document.activeElement;setCockpitSheetState('compact')}
 function closeSheet({restoreFocus=true}={}){setCockpitSheetState('closed',{restoreFocus})}

 cockpitToggle?.addEventListener('click',event=>{
  if(!isMobile())return;
  event.preventDefault();event.stopImmediatePropagation();
  lastTrigger=event.currentTarget;
  if(sheetState==='closed')openCompact(event.currentTarget);else closeSheet();
 },{capture:true});
 cockpitClose?.addEventListener('click',event=>{
  if(!isMobile())return;
  event.preventDefault();event.stopImmediatePropagation();closeSheet();
 },{capture:true});
 sheetToggle.addEventListener('click',()=>setCockpitSheetState(sheetState==='expanded'?'compact':'expanded'));

 const sheetObserver=typeof MutationObserver==='function'?new MutationObserver(()=>{
  if(!isMobile()||mutatingSheet)return;
  const open=cockpit.classList.contains('open');
  if(open&&sheetState==='closed')openCompact();
  else if(!open&&sheetState!=='closed')closeSheet({restoreFocus:false});
 }):null;
 sheetObserver?.observe(cockpit,{attributes:true,attributeFilter:['class']});

 const escapeHandler=event=>{
  if(event.key!=='Escape'||!isMobile())return;
  if(byId('lab-panel')?.classList.contains('open')){byId('panel-close')?.click();return}
  if(sheetState!=='closed')closeSheet();
 };
 document.addEventListener('keydown',escapeHandler);

 const domainObserver=typeof MutationObserver==='function'?new MutationObserver(sync):null;
 domainObserver?.observe(document.documentElement,{attributes:true,attributeFilter:['data-atlas-domain']});
 const stageSource=byId('stage-source');
 const graphObserver=stageSource&&typeof MutationObserver==='function'?new MutationObserver(sync):null;
 if(stageSource)graphObserver?.observe(stageSource,{childList:true,characterData:true,subtree:true});

 function sync(){
  const experience=currentExperience(visualExperience);
  const state=experience?.state||{};
  const domain=document.documentElement.dataset.atlasDomain||state.domain||'NEXO';
  for(const item of nav.querySelectorAll('[data-domain-target]')){
   const active=item.dataset.domainTarget===domain;
   item.classList.toggle('is-active',active);
   if(active)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
  }
  const enabled=Boolean(state.filaments);
  filaments.setAttribute('aria-pressed',String(enabled));
  filaments.classList.toggle('is-active',enabled);
  const visible=(state.graph?.edges||[]).filter(edge=>edge.associative&&!edge.contextEdge).length;
  filamentCount.textContent=visible?String(visible):'';
  filamentCount.setAttribute('aria-label',visible?`${visible} filamentos visíveis`:'Nenhum filamento visível');
 }

 if(isMobile())setCockpitSheetState(cockpit.classList.contains('open')?'compact':'closed');
 sync();
 const api={sync,setCockpitSheetState,openCompact,closeSheet,destroy(){
  sheetObserver?.disconnect();domainObserver?.disconnect();graphObserver?.disconnect();document.removeEventListener('keydown',escapeHandler);
  if(rendererSuspended)renderer?.start?.();nav.remove();tools.remove();sheetToggle.remove();
 }};
 globalThis.__ATLAS_MOBILE_UX_V6=api;
 return api;
}
