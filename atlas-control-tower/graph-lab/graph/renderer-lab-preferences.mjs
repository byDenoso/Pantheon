import {PRESETS} from './palette.mjs';
import {GraphLabRenderer as LegacyCanvasRenderer} from './legacy-renderer.mjs';
import {GraphLabRenderer as ThreeCanvasRenderer} from './renderer.mjs';

const STORAGE_KEY='nexo-atlas-renderer-lab-v1';
const DEFAULT_BOOT_PRESETS=new Set(['ORIGINAL','MOBILE']);
const OPTION_IDS=['node-radius','glow','fog','perspective','drift','pulse-speed','filament-curve','max-labels','max-visible'];
const CONTROL_TO_OPTION={
 'node-radius':'nodeRadius',
 glow:'glow',
 fog:'fog',
 perspective:'focalLength',
 drift:'drift',
 'pulse-speed':'pulseSpeed',
 'filament-curve':'filamentCurve',
 'max-labels':'maxLabels',
 'max-visible':'maxVisibleNodes'
};
const OPTION_TO_CONTROL=Object.fromEntries(Object.entries(CONTROL_TO_OPTION).map(([id,key])=>[key,id]));

const base=PRESETS.ORIGINAL;
export const EXTRA_PRESETS={
 REFERENCE_3:{...base,name:'REFERENCE_3',stars:260,glow:.96,fog:.31,focalLength:760,drift:0,pulseSpeed:1.08,filamentCurve:.15,maxLabels:24,maxVisibleNodes:110,transitionMs:420},
 GALACTIC_DUST:{...base,name:'GALACTIC_DUST',stars:320,glow:1.12,fog:.24,focalLength:720,drift:.25,pulseSpeed:1.16,filamentCurve:.18,maxLabels:26,maxVisibleNodes:120,transitionMs:460},
 FOCUS_REVIEW:{...base,name:'FOCUS_REVIEW',stars:180,nodeRadius:1.18,glow:1.08,fog:.29,focalLength:690,drift:0,pulseSpeed:.92,filamentCurve:.10,maxLabels:18,maxVisibleNodes:74,transitionMs:360},
 MOBILE_CLEAN:{...base,name:'MOBILE_CLEAN',stars:150,nodeRadius:.95,glow:.72,fog:.38,focalLength:790,drift:0,pulseSpeed:.85,filamentCurve:.09,maxLabels:9,maxVisibleNodes:58,transitionMs:320},
 PERFORMANCE:{...base,name:'PERFORMANCE',stars:90,nodeRadius:.85,glow:.48,fog:.42,focalLength:820,drift:0,pulseSpeed:.55,filamentCurve:.07,maxLabels:8,maxVisibleNodes:56,transitionMs:260},
 PRESENTATION:{...base,name:'PRESENTATION',stars:240,nodeRadius:1.08,glow:1.22,fog:.22,focalLength:700,drift:.12,pulseSpeed:1.12,filamentCurve:.20,maxLabels:30,maxVisibleNodes:90,transitionMs:520}
};
Object.assign(PRESETS,EXTRA_PRESETS);

function readPreferences(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{}}catch{return {}}}
function writePreferences(next){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next))}catch{}}
function mergePreferences(partial){
 const prev=readPreferences();
 const next={...prev,...partial,options:{...(prev.options||{}),...(partial.options||{})}};
 if(partial.options&&Object.keys(partial.options).length===0)delete next.options;
 writePreferences(next);
 return next;
}
function clampValue(id,value){
 const input=document.getElementById(id);if(!input)return value;
 const min=input.min===''?-Infinity:Number(input.min),max=input.max===''?Infinity:Number(input.max);
 return Math.max(min,Math.min(max,Number(value)));
}
function setControlValue(id,value){
 const input=document.getElementById(id);if(!input||value==null||Number.isNaN(Number(value)))return;
 const next=clampValue(id,value);input.value=String(next);
 const out=document.getElementById(`${id}-out`);
 if(out){const decimals=['perspective','max-labels','max-visible'].includes(id)?0:id==='drift'?1:2;out.textContent=Number(next).toFixed(decimals)}
}
function applyStoredControls(){
 const prefs=readPreferences();
 if(prefs.preset&&PRESETS[prefs.preset]){const preset=document.getElementById('preset');if(preset)preset.value=prefs.preset}
 if(prefs.dataset){const dataset=document.getElementById('dataset-size');if(dataset)dataset.value=String(prefs.dataset)}
 for(const [key,value] of Object.entries(prefs.options||{})){const id=OPTION_TO_CONTROL[key];if(id)setControlValue(id,value)}
}
function installPresetOptions(){
 const select=document.getElementById('preset');if(!select)return;
 const labels={REFERENCE_3:'REFERENCE 3 · aprovado',GALACTIC_DUST:'GALACTIC DUST',FOCUS_REVIEW:'FOCUS REVIEW',MOBILE_CLEAN:'MOBILE CLEAN',PERFORMANCE:'PERFORMANCE',PRESENTATION:'PRESENTATION'};
 for(const [value,label] of Object.entries(labels)){
  if([...select.options].some(option=>option.value===value))continue;
  const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);
 }
}
function currentPresetFromOptions(options){return Object.keys(PRESETS).find(name=>PRESETS[name]===options)||null}
export function patchRendererPrototype(Renderer){
 if(!Renderer?.prototype||Renderer.prototype.__rendererLabPreferencesPatched)return;
 const originalSetPreset=Renderer.prototype.setPreset;
 const originalSetOptions=Renderer.prototype.setOptions;
 Renderer.prototype.setPreset=function(name){
  const prefs=readPreferences();
  const useSaved=DEFAULT_BOOT_PRESETS.has(name)&&prefs.preset&&PRESETS[prefs.preset];
  const target=useSaved?prefs.preset:name;
  const result=originalSetPreset.call(this,target);
  this.__atlasRendererPreset=target;
  const overrides=prefs.options||{};
  if(Object.keys(overrides).length&&originalSetOptions)originalSetOptions.call(this,overrides);
  const select=document.getElementById('preset');if(select&&PRESETS[target])select.value=target;
  mergePreferences({preset:target});
  return result;
 };
 Renderer.prototype.setOptions=function(partial={}){
  const result=originalSetOptions.call(this,partial);
  const preset=this.__atlasRendererPreset||currentPresetFromOptions(this.options)||document.getElementById('preset')?.value||'ORIGINAL';
  const safe={};
  for(const [key,value] of Object.entries(partial))if(OPTION_TO_CONTROL[key])safe[key]=Number(value);
  mergePreferences({preset,options:safe});
  return result;
 };
 Renderer.prototype.__rendererLabPreferencesPatched=true;
}
patchRendererPrototype(LegacyCanvasRenderer);
patchRendererPrototype(ThreeCanvasRenderer);

function persistFromDom(){
 const preset=document.getElementById('preset')?.value;
 const dataset=document.getElementById('dataset-size')?.value;
 const options={};
 for(const id of OPTION_IDS){const input=document.getElementById(id);if(input)options[CONTROL_TO_OPTION[id]]=Number(input.value)}
 mergePreferences({preset,dataset,options});
}
function installDomPersistence(){
 installPresetOptions();
 applyStoredControls();
 document.getElementById('preset')?.addEventListener('change',()=>mergePreferences({preset:document.getElementById('preset').value}));
 document.getElementById('dataset-size')?.addEventListener('change',()=>mergePreferences({dataset:document.getElementById('dataset-size').value}));
 for(const id of OPTION_IDS){const input=document.getElementById(id);input?.addEventListener('input',()=>mergePreferences({options:{[CONTROL_TO_OPTION[id]]:Number(input.value)}}))}
 window.addEventListener('pagehide',persistFromDom,{capture:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installDomPersistence,{once:true});
else installDomPersistence();

export const rendererLabPreferences={read:readPreferences,write:writePreferences,installPresetOptions,applyStoredControls};
