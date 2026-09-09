import {ENVIRONMENT_RENDERER_IDS,GRAPH_RENDERER_IDS,RENDERERS,rendererById,resolveRenderer} from './renderer-registry.mjs';

const STORAGE_KEY='nexo-atlas-renderer-runtime-v6';
const ENV_SET=new Set(ENVIRONMENT_RENDERER_IDS);
const isMobileViewport=()=>typeof matchMedia==='function'&&matchMedia('(max-width:760px)').matches;

function safeRead(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{}}catch{return {}}}
function safeWrite(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value))}catch{}}

function graphSemanticForEnvironment(id){
 if(id==='babylon-3d')return 'three-3d';
 if(id==='babylon-25d')return 'three-25d';
 return 'canvas-2d';
}

export function resolveRendererSelection({experienceRenderer='canvas-2d',savedRenderer=null,requestedRenderer=null,manualOverride=false,mobile=false,environment=null}={}){
 const candidate=manualOverride?(requestedRenderer||savedRenderer):experienceRenderer;
 const info=rendererById(candidate||experienceRenderer);
 let graphRendererId=info.role==='graph'?info.id:graphSemanticForEnvironment(info.id);
 let environmentRendererId=info.role==='environment'?info.id:(ENV_SET.has(environment)?environment:null);
 graphRendererId=resolveRenderer(graphRendererId,{mobile}).id;
 if(mobile&&environmentRendererId&&!rendererById(environmentRendererId).mobileSafe)environmentRendererId=null;
 return Object.freeze({graphRendererId,environmentRendererId,manualOverride:Boolean(manualOverride)});
}

export function rendererNavigationUrl(rendererId,href='http://localhost/'){
 const info=rendererById(rendererId);
 const url=new URL(href);
 const graphId=info.role==='graph'?info.id:graphSemanticForEnvironment(info.id);
 const graphInfo=rendererById(graphId);
 url.searchParams.set('renderer-v4',info.id);
 url.searchParams.set('renderer',graphInfo.baseRenderer);
 if(info.role==='environment')url.searchParams.set('environment',info.id);else url.searchParams.delete('environment');
 url.searchParams.delete('fallback');
 return url;
}

export function clearManualRendererOverride(){const saved=safeRead();safeWrite({...saved,manualRenderer:false,rendererId:null})}
export function saveManualRendererOverride(rendererId){const saved=safeRead();safeWrite({...saved,manualRenderer:true,rendererId})}

export function runtimeRendererState({experienceRenderer='canvas-2d'}={}){
 const query=new URLSearchParams(typeof location==='undefined'?'':location.search);
 const saved=safeRead();
 const explicit=query.get('renderer-v4');
 const manualOverride=Boolean(explicit||saved.manualRenderer===true);
 return resolveRendererSelection({experienceRenderer,requestedRenderer:explicit,savedRenderer:saved.rendererId,manualOverride,mobile:isMobileViewport(),environment:query.get('environment')||saved.environment||null});
}

function replaceOptions(select,current){
 if(!select)return;
 const fragment=document.createDocumentFragment();
 for(const id of GRAPH_RENDERER_IDS){const item=RENDERERS[id];const option=document.createElement('option');option.value=id;option.textContent=item.label;fragment.append(option)}
 select.replaceChildren(fragment);select.value=GRAPH_RENDERER_IDS.includes(current)?current:GRAPH_RENDERER_IDS[0];
}

function ensureEnvironmentSelect(current){
 let select=document.getElementById('atlas-environment-engine');if(select){select.value=current||'none';return select}
 const rendererRow=document.getElementById('renderer')?.closest('label');if(!rendererRow)return null;
 const row=document.createElement('label');row.className='select-row atlas-environment-row';row.append(document.createTextNode('Environment'));
 select=document.createElement('select');select.id='atlas-environment-engine';
 const none=document.createElement('option');none.value='none';none.textContent='Native / none';select.append(none);
 for(const id of ENVIRONMENT_RENDERER_IDS){const option=document.createElement('option');option.value=id;option.textContent=RENDERERS[id].label;select.append(option)}
 row.append(select);rendererRow.after(row);select.value=current||'none';return select;
}

export function installRendererRuntime({experienceRenderer='canvas-2d'}={}){
 if(typeof document==='undefined')return null;
 const state=runtimeRendererState({experienceRenderer});
 const graphSelect=document.getElementById('renderer');replaceOptions(graphSelect,state.graphRendererId);
 const envSelect=ensureEnvironmentSelect(state.environmentRendererId);
 document.documentElement.dataset.atlasRenderer=state.graphRendererId;
 if(state.environmentRendererId)document.documentElement.dataset.atlasEnvironment=state.environmentRendererId;else document.documentElement.removeAttribute('data-atlas-environment');
 if(graphSelect&&!graphSelect.dataset.atlasRuntimeV6){graphSelect.dataset.atlasRuntimeV6='true';graphSelect.addEventListener('change',event=>{event.stopImmediatePropagation();const id=event.currentTarget.value;saveManualRendererOverride(id);location.assign(rendererNavigationUrl(id,location.href).href)},{capture:true})}
 if(envSelect&&!envSelect.dataset.atlasRuntimeV6){envSelect.dataset.atlasRuntimeV6='true';envSelect.addEventListener('change',event=>{event.stopImmediatePropagation();const id=event.currentTarget.value;const saved=safeRead();safeWrite({...saved,environment:id==='none'?null:id});if(id==='none')document.documentElement.removeAttribute('data-atlas-environment');else document.documentElement.dataset.atlasEnvironment=id;const url=new URL(location.href);if(id==='none')url.searchParams.delete('environment');else url.searchParams.set('environment',id);history.replaceState(history.state,'',url)},{capture:true})}
 const dimension=document.getElementById('dimension-mode');if(dimension)dimension.textContent=rendererById(state.graphRendererId).dimension;
 globalThis.__ATLAS_RENDERER_RUNTIME={...state};return globalThis.__ATLAS_RENDERER_RUNTIME;
}

export const rendererRuntimeStorageKey=STORAGE_KEY;
