import {GRAPH_RENDERER_IDS,RENDERERS,isRendererId,rendererById,resolveRenderer} from './renderer-registry.mjs';

const STORAGE_KEY='nexo-atlas-renderer-runtime-v7';
const LEGACY_STORAGE_KEYS=['nexo-atlas-renderer-runtime-v6','nexo-atlas-renderer-lab-v3','nexo-atlas-renderer-lab-v1'];
const isMobileViewport=()=>typeof matchMedia==='function'&&matchMedia('(max-width:760px)').matches;

function safeRead(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{}}catch{return {}}}
function safeWrite(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value))}catch{}}
function clearLegacyState(){try{for(const key of LEGACY_STORAGE_KEYS)localStorage.removeItem(key)}catch{}}

export function rendererIdFromUrl(href=typeof location==='undefined'?'http://localhost/':location.href){
 const url=new URL(href,'http://localhost/');
 const semantic=url.searchParams.get('renderer-v4');if(isRendererId(semantic))return semantic;
 const base=url.searchParams.get('renderer');if(base==='three-canvas')return 'three-25d';if(base==='legacy-canvas')return 'canvas-2d';
 return null;
}

export function resolveRendererSelection({experienceRenderer='canvas-2d',savedRenderer=null,requestedRenderer=null,manualOverride=false,mobile=false}={}){
 const candidate=manualOverride?(requestedRenderer||savedRenderer):experienceRenderer;
 const graphRendererId=resolveRenderer(candidate||experienceRenderer,{mobile}).id;
 return Object.freeze({graphRendererId,manualOverride:Boolean(manualOverride)});
}

export function rendererNavigationUrl(rendererId,href='http://localhost/'){
 const info=rendererById(rendererId);const url=new URL(href,'http://localhost/');
 url.searchParams.set('renderer-v4',info.id);url.searchParams.set('renderer',info.baseRenderer);url.searchParams.delete('environment');url.searchParams.delete('fallback');return url;
}

export function clearManualRendererOverride(){safeWrite({manualRenderer:false,rendererId:null});clearLegacyState()}
export function saveManualRendererOverride(rendererId){safeWrite({manualRenderer:true,rendererId:rendererById(rendererId).id});clearLegacyState()}
export function runtimeRendererState({experienceRenderer='canvas-2d'}={}){
 const query=typeof location==='undefined'?new URLSearchParams():new URLSearchParams(location.search);const saved=safeRead();const explicit=query.get('renderer-v4');const requestedRenderer=isRendererId(explicit)?explicit:null;const manualOverride=Boolean(requestedRenderer||saved.manualRenderer===true);
 return resolveRendererSelection({experienceRenderer,requestedRenderer,savedRenderer:saved.rendererId,manualOverride,mobile:isMobileViewport()});
}

function replaceOptions(select,current){if(!select)return;const fragment=document.createDocumentFragment();for(const id of GRAPH_RENDERER_IDS){const item=RENDERERS[id],option=document.createElement('option');option.value=id;option.textContent=item.label;fragment.append(option)}select.replaceChildren(fragment);select.value=GRAPH_RENDERER_IDS.includes(current)?current:GRAPH_RENDERER_IDS[0]}

export function installRendererRuntime({experienceRenderer='canvas-2d'}={}){
 if(typeof document==='undefined')return null;clearLegacyState();const state=runtimeRendererState({experienceRenderer});const graphSelect=document.getElementById('renderer');replaceOptions(graphSelect,state.graphRendererId);document.documentElement.dataset.atlasRenderer=state.graphRendererId;
 if(graphSelect&&!graphSelect.dataset.atlasRuntimeV7){graphSelect.dataset.atlasRuntimeV7='true';graphSelect.addEventListener('change',event=>{event.stopImmediatePropagation();const id=event.currentTarget.value;saveManualRendererOverride(id);location.assign(rendererNavigationUrl(id,location.href).href)},{capture:true})}
 const dimension=document.getElementById('dimension-mode');if(dimension)dimension.textContent=rendererById(state.graphRendererId).dimension;globalThis.__ATLAS_RENDERER_RUNTIME={...state};return globalThis.__ATLAS_RENDERER_RUNTIME;
}

export const rendererRuntimeStorageKey=STORAGE_KEY;
