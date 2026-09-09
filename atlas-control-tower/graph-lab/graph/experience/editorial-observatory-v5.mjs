import '../renderers/engine-bridge-auto.mjs';

const STORAGE_KEY='nexo-atlas-design-v5';
const DESIGN_LABEL={editorial:'Editorial',performance:'Performance'};

function read(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{}}catch{return {}}}
function write(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value))}catch{}}
function ensureCss(){if(document.querySelector('link[data-atlas-editorial-v5]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./editorial-observatory-v5.css',import.meta.url).href;link.dataset.atlasEditorialV5='';document.head.append(link)}
function requestedDesign(){const query=new URLSearchParams(location.search);const q=query.get('design');if(q==='performance'||q==='editorial')return q;const saved=read().design;if(saved==='performance'||saved==='editorial')return saved;return document.documentElement.dataset.atlasExperience==='PRESENTATION_3D'?'performance':'editorial'}
function applyDesign(design,{persist=true}={}){const next=design==='performance'?'performance':'editorial';document.documentElement.setAttribute('data-atlas-design',next);document.documentElement.dataset.atlasProduct='Editorial Observatory';document.documentElement.style.colorScheme='dark';const button=document.getElementById('atlas-design-toggle');if(button){button.textContent=DESIGN_LABEL[next];button.setAttribute('aria-label',`Visual atual: ${DESIGN_LABEL[next]}. Alternar visual.`)}if(persist)write({design:next});return next}
function installToggle(){const tools=document.querySelector('.topbar-tools');if(!tools||document.getElementById('atlas-design-toggle'))return;const button=document.createElement('button');button.id='atlas-design-toggle';button.type='button';button.className='atlas-top-action atlas-design-toggle';button.textContent='Editorial';button.addEventListener('click',()=>applyDesign(document.documentElement.dataset.atlasDesign==='editorial'?'performance':'editorial'));tools.prepend(button)}
function simplifyLabels(){for(const button of document.querySelectorAll('#expand-all,#collapse-all,#active-only,#cockpit-mode,#panel-toggle')){if(!button.dataset.originalTitle)button.dataset.originalTitle=button.title||button.textContent||''}const details=document.getElementById('cockpit-toggle');if(details&&details.textContent?.trim().toUpperCase()==='DETALHES')details.textContent='Contexto'}
function install(){ensureCss();installToggle();simplifyLabels();applyDesign(requestedDesign(),{persist:false});if(typeof MutationObserver==='function')new MutationObserver(records=>{if(!records.some(r=>r.attributeName==='data-atlas-experience'))return;const explicit=new URLSearchParams(location.search).get('design');if(explicit)return;const experience=document.documentElement.dataset.atlasExperience;if(experience==='PRESENTATION_3D')applyDesign('performance',{persist:false})}).observe(document.documentElement,{attributes:true,attributeFilter:['data-atlas-experience']})}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else queueMicrotask(install);

export {applyDesign};
