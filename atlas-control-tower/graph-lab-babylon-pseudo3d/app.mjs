import {createSyntheticGraph} from '../graph-lab/data/synthetic-graph.mjs';
import {SYSTEM_COLORS,STATUS_COLORS,PRESETS} from '../graph-lab/graph/palette.mjs';
import {BabylonPseudo3DGraphLab} from './scene.mjs';

const $=id=>document.getElementById(id);
let graph=createSyntheticGraph(50),focusId=graph.rootId,history=[];

function viewForFocus(source,id,maxVisible=120){
 const byId=new Map(source.nodes.map(n=>[n.id,n]));
 const children=new Map();
 for(const n of source.nodes)if(n.parentId){const a=children.get(n.parentId)||[];a.push(n.id);children.set(n.parentId,a)}
 const ids=new Set([id]);let frontier=[id];
 for(let depth=0;depth<2&&frontier.length;depth++){
  const next=[];
  for(const parent of frontier){for(const child of children.get(parent)||[]){if(ids.size>=maxVisible)break;ids.add(child);next.push(child)}}
  frontier=next;
 }
 let cur=byId.get(id);while(cur?.parentId&&ids.size<maxVisible){ids.add(cur.parentId);cur=byId.get(cur.parentId)}
 const nodes=source.nodes.filter(n=>ids.has(n.id)),valid=new Set(nodes.map(n=>n.id));
 return{nodes,edges:source.edges.filter(e=>valid.has(e.source)&&valid.has(e.target))};
}

const renderer=new BabylonPseudo3DGraphLab($('renderCanvas'),$('labels-layer'),{
 palette:{SYSTEM_COLORS,STATUS_COLORS,preset:PRESETS.ORIGINAL},
 onSelect:node=>{if(node)$('focus-label').textContent=node.label},
 onOpen:node=>{if(node?.hiddenChildren>0){history.push(focusId);focusId=node.id;$('focus-label').textContent=node.label;refresh()}},
 onStats:s=>{$('fps').textContent=s.fps.toFixed(0);$('frame').textContent=s.frameMs.toFixed(1);$('nodes').textContent=s.nodes;$('edges').textContent=s.edges;$('labels').textContent=s.labels}
});

function refresh(){renderer.setGraph(viewForFocus(graph,focusId,renderer.options.maxVisibleNodes),{focusId})}
function rebuild(count){graph=createSyntheticGraph(count);focusId=graph.rootId;history=[];$('focus-label').textContent='NEXO';refresh()}

$('dataset-size').addEventListener('change',e=>rebuild(Number(e.target.value)));
$('depth').addEventListener('input',e=>{const v=Number(e.target.value);$('depth-out').textContent=v.toFixed(2);renderer.setOptions({depthScale:v});renderer.rebuildScene()});
$('glow').addEventListener('input',e=>{const v=Number(e.target.value);$('glow-out').textContent=v.toFixed(2);renderer.setOptions({glow:v})});
$('pulse').addEventListener('input',e=>{const v=Number(e.target.value);$('pulse-out').textContent=v.toFixed(2);renderer.setOptions({pulseSpeed:v})});
$('max-labels').addEventListener('input',e=>{const v=Number(e.target.value);$('labels-out').textContent=String(v);renderer.setOptions({maxLabels:v});renderer.rebuildLabels()});
$('motion').addEventListener('click',e=>{const next=!renderer.options.autoOrbit;renderer.setOptions({autoOrbit:next});e.currentTarget.setAttribute('aria-pressed',String(next));e.currentTarget.textContent=next?'Ⅱ':'▷'});
$('back').addEventListener('click',()=>{if(history.length){focusId=history.pop();const n=graph.nodes.find(x=>x.id===focusId);$('focus-label').textContent=n?.label||'NEXO';refresh()}});
$('home').addEventListener('click',()=>{if(focusId!==graph.rootId)history.push(focusId);focusId=graph.rootId;$('focus-label').textContent='NEXO';refresh()});
$('zoom-in').addEventListener('click',()=>renderer.zoom(.84));
$('zoom-out').addEventListener('click',()=>renderer.zoom(1.18));
$('fit').addEventListener('click',()=>renderer.fit());
$('center').addEventListener('click',()=>renderer.centerSelected());

refresh();renderer.start();
