import {createSyntheticGraph} from './data/synthetic-graph.mjs';
import {GraphLabRenderer as SigmaCanvasRenderer} from './graph/renderer.mjs';
import {GraphLabRenderer as LegacyCanvasRenderer} from './graph/legacy-renderer.mjs';

const $=id=>document.getElementById(id);
const stage=$('graph-stage');
let graph=createSyntheticGraph(50),focusId=graph.rootId,history=[];
const rendererMode=new URLSearchParams(location.search).get('renderer')||'sigma-canvas';
const Renderer=rendererMode==='legacy-canvas'?LegacyCanvasRenderer:SigmaCanvasRenderer;
const target=rendererMode==='legacy-canvas'?$('graph-lab-canvas'):stage;
$('renderer').value=rendererMode;
$('graph-lab-canvas').hidden=rendererMode!=='legacy-canvas';

function viewForFocus(source,id,maxVisible){const byId=new Map(source.nodes.map(n=>[n.id,n]));const children=new Map();for(const n of source.nodes)if(n.parentId){const a=children.get(n.parentId)||[];a.push(n.id);children.set(n.parentId,a)}const ids=new Set([id]);let frontier=[id];for(let depth=0;depth<2&&frontier.length;depth++){const next=[];for(const parent of frontier)for(const child of children.get(parent)||[]){if(ids.size>=maxVisible)break;ids.add(child);next.push(child)}frontier=next}let cur=byId.get(id);while(cur?.parentId&&ids.size<maxVisible){ids.add(cur.parentId);cur=byId.get(cur.parentId)}const nodes=source.nodes.filter(n=>ids.has(n.id));const valid=new Set(nodes.map(n=>n.id));return{nodes,edges:source.edges.filter(e=>valid.has(e.source)&&valid.has(e.target))}}

const renderer=new Renderer(target,{onSelect:node=>{if(node)$('focus-label').textContent=node.label},onOpen:node=>{if(node.hiddenChildren>0){history.push(focusId);focusId=node.id;$('focus-label').textContent=node.label;refresh()}},onStats:s=>{$('hud-fps').textContent=Number(s.fps||0).toFixed(0);$('hud-frame').textContent=Number(s.frameMs||0).toFixed(1);$('hud-nodes').textContent=s.nodes;$('hud-edges').textContent=s.edges;$('hud-labels').textContent=s.labels;$('hud-dpr').textContent=Number(s.dpr||1).toFixed(1)}});
function refresh(){renderer.setGraph(viewForFocus(graph,focusId,renderer.options.maxVisibleNodes),{focusId})}
function rebuild(count){graph=createSyntheticGraph(count);focusId=graph.rootId;history=[];$('focus-label').textContent='NEXO';refresh()}
function syncControls(){const o=renderer.options;for(const [id,key] of [['node-radius','nodeRadius'],['glow','glow'],['fog','fog'],['perspective','focalLength'],['drift','drift'],['pulse-speed','pulseSpeed'],['filament-curve','filamentCurve'],['max-labels','maxLabels'],['max-visible','maxVisibleNodes']]){const input=$(id);if(input&&o[key]!=null){input.value=o[key];$(`${id}-out`).textContent=Number(o[key]).toFixed(['perspective','max-labels','max-visible'].includes(id)?0:id==='drift'?1:2)}}}
$('renderer').addEventListener('change',e=>{const u=new URL(location.href);u.searchParams.set('renderer',e.target.value);location.assign(u)});
$('preset').addEventListener('change',e=>{renderer.setPreset(e.target.value);syncControls();refresh()});$('dataset-size').addEventListener('change',e=>rebuild(Number(e.target.value)));
for(const [id,key] of [['node-radius','nodeRadius'],['glow','glow'],['fog','fog'],['perspective','focalLength'],['drift','drift'],['pulse-speed','pulseSpeed'],['filament-curve','filamentCurve'],['max-labels','maxLabels'],['max-visible','maxVisibleNodes']])$(id).addEventListener('input',e=>{const value=Number(e.target.value);renderer.setOptions({[key]:value});$(`${id}-out`).textContent=value.toFixed(['perspective','max-labels','max-visible'].includes(id)?0:id==='drift'?1:2);if(key==='maxVisibleNodes')refresh()});
$('motion').addEventListener('click',e=>{renderer.setOptions({autoOrbit:!renderer.options.autoOrbit});e.currentTarget.setAttribute('aria-pressed',String(renderer.options.autoOrbit));e.currentTarget.textContent=renderer.options.autoOrbit?'Ⅱ':'▷'});$('back').addEventListener('click',()=>{if(history.length){focusId=history.pop();$('focus-label').textContent=graph.nodes.find(n=>n.id===focusId)?.label||'NEXO';refresh()}});$('home').addEventListener('click',()=>{if(focusId!==graph.rootId)history.push(focusId);focusId=graph.rootId;$('focus-label').textContent='NEXO';refresh()});$('zoom-in').addEventListener('click',()=>renderer.zoom(1.15));$('zoom-out').addEventListener('click',()=>renderer.zoom(.86));$('fit').addEventListener('click',()=>renderer.fit());$('center').addEventListener('click',()=>renderer.centerSelected());$('flat').addEventListener('click',e=>{const flat=renderer.toggleFlat();e.currentTarget.textContent=flat?'2D':'3D'});
const panel=$('lab-panel');$('panel-toggle').addEventListener('click',()=>panel.classList.add('open'));$('panel-close').addEventListener('click',()=>panel.classList.remove('open'));
renderer.setPreset(matchMedia('(max-width:760px)').matches?'MOBILE':'ORIGINAL');syncControls();refresh();renderer.start();
