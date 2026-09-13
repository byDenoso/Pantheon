import {captureFrame,createNavigationState,goBack,goForward,pushFrame,replaceCurrentFrame} from './spatial-navigation.mjs';

const ROOT={id:'system:NEXO',label:'NEXO'};
const BASE_SCENE={camera:{},zoom:1,yaw:0,pitch:0,expandedRelations:[],visibleLayers:['hierarchy','relations']};
const copyPath=path=>Array.isArray(path)?path.map(item=>({...item})):[{...ROOT}];
const filtered=filters=>Object.values(filters||{}).some(Boolean);

export function createSpatialSession(api,{limit=120,depth=3,onPersist}={}){
 let nav=createNavigationState({rootNode:ROOT.id,path:[ROOT],...BASE_SCENE});
 const s={focus:ROOT.id,mode:'children',ui:'overview',filters:{},offset:0,extraLimit:0,depth,path:[{...ROOT}],selected:null,graph:null,summary:null,syncing:false,scene:{...BASE_SCENE,camera:{}},navigationStack:nav.navigationStack,navigationIndex:nav.navigationIndex,pins:[],compare:[]};
 const listeners=new Set();let loadSeq=0;
 const emit=(event,payload)=>{for(const fn of listeners)fn(event,payload)};
 const persist=()=>{try{onPersist?.(s.filters)}catch{}};
 const syncNav=next=>{nav=next;s.navigationStack=next.navigationStack;s.navigationIndex=next.navigationIndex};
 const frame=(extra={})=>captureFrame({rootNode:s.focus,selectedNode:s.selected,filters:s.filters,path:s.path,camera:s.scene.camera,zoom:s.scene.zoom,yaw:s.scene.yaw,pitch:s.scene.pitch,expandedRelations:s.scene.expandedRelations,visibleLayers:s.scene.visibleLayers,...extra});
 const saveFrame=()=>syncNav(replaceCurrentFrame(nav,frame({navigationKind:nav.frame?.navigationKind||'restore'})));
 const applyFrame=f=>{s.focus=f.rootNode;s.selected=f.selectedNode;s.filters={...f.filters};s.mode=filtered(s.filters)?'search':'children';s.path=f.path?.length?copyPath(f.path):[{...ROOT},{id:f.rootNode,label:f.rootNode}];s.offset=0;s.extraLimit=0;s.scene={camera:{...f.camera},zoom:f.zoom,yaw:f.yaw,pitch:f.pitch,expandedRelations:[...f.expandedRelations],visibleLayers:[...f.visibleLayers]};persist()};

 async function refresh(){
  const seq=++loadSeq;const filters={...s.filters};const q={...filters,focus:s.focus,mode:s.mode,offset:s.offset,limit:limit+s.extraLimit,depth:s.depth};emit('loading',{focus:s.focus});
  const graphRead=(async()=>{try{const graph=await api.graph(q);if(seq!==loadSeq)return null;s.graph=graph;emit('graph',{graph,summary:s.summary});return graph}catch(error){if(seq===loadSeq)emit('graph-error',{error});return null}})();
  const summaryRead=(async()=>{try{const summary=await api.state(filters);if(seq!==loadSeq)return null;s.summary=summary;emit('summary',{summary,graph:s.graph});return summary}catch(error){if(seq===loadSeq)emit('summary-error',{error});return null}})();
  const [result]=await Promise.allSettled([graphRead,summaryRead]);if(seq!==loadSeq)return null;return result.status==='fulfilled'?result.value:null;
 }

 const restore=async result=>{if(!result?.frame)return null;syncNav(result.state);applyFrame(result.frame);emit('focus',{node:{id:s.focus,label:s.path.at(-1)?.label||s.focus},path:s.path,navigationKind:'restore'});emit('scene',{...s.scene,restore:true});return refresh()};
 const focusNode=async(node,push=true,navigationKind='drill-down')=>{saveFrame();s.selected=null;s.focus=node.id;s.mode='children';s.offset=0;s.extraLimit=0;s.filters={};persist();if(push){const i=s.path.findIndex(p=>p.id===node.id);s.path=i>=0?s.path.slice(0,i+1):[...s.path,{id:node.id,label:node.label}]}s.scene={...BASE_SCENE,camera:{}};const kind=node.navigationKind==='cross-domain'||navigationKind==='cross-domain'?'cross-domain':'drill-down';syncNav(pushFrame(nav,frame({navigationKind:kind})));emit('focus',{node,path:s.path,navigationKind:kind});emit('scene',{...s.scene,restore:false});return refresh()};
 const investigation=()=>emit('investigation',{pins:[...s.pins],compare:[...s.compare]});

 return{state:s,on(fn){listeners.add(fn);return()=>listeners.delete(fn)},restoreFilters(filters){if(filters&&typeof filters==='object'){s.filters={...filters};saveFrame()}},refresh,setDepth(value){const d=Math.max(1,Math.min(4,Number(value)||1));if(d===s.depth)return null;s.depth=d;s.offset=0;s.extraLimit=0;return refresh()},setMode(mode){s.mode=mode;s.offset=0;s.extraLimit=0;return refresh()},setUi(ui){s.ui=ui;emit('ui',{ui})},setFilters(patch){Object.assign(s.filters,patch);s.offset=0;s.extraLimit=0;s.mode=filtered(s.filters)?'search':'children';persist();saveFrame();return refresh()},clearFilters(){s.filters={};s.offset=0;s.extraLimit=0;s.mode='children';persist();saveFrame();return refresh()},more(){if(s.graph?.truncated)s.extraLimit+=limit;else s.offset+=limit;return refresh()},select(id){s.selected=id;saveFrame();emit('select',{id})},deselect(){s.selected=null;saveFrame();emit('deselect',{})},focusNode,home(){return focusNode({...ROOT},true,'drill-down')},back(){if(s.navigationIndex<1)return null;saveFrame();return restore(goBack(nav))},forward(){if(s.navigationIndex>=s.navigationStack.length-1)return null;saveFrame();return restore(goForward(nav))},setSceneState(patch){s.scene={...s.scene,...patch,camera:patch?.camera?{...s.scene.camera,...patch.camera}:s.scene.camera};saveFrame();emit('scene',{...s.scene,restore:false});return s.scene},pin(id){if(!s.pins.includes(id))s.pins=[...s.pins,id];investigation();return[...s.pins]},unpin(id){s.pins=s.pins.filter(value=>value!==id);investigation();return[...s.pins]},toggleCompare(id){s.compare=s.compare.includes(id)?s.compare.filter(value=>value!==id):[...s.compare.slice(-1),id];investigation();return[...s.compare]},async sync(){if(s.syncing)return null;s.syncing=true;emit('syncing',{on:true});try{const result=await api.sync();await refresh();return result}catch{return null}finally{s.syncing=false;emit('syncing',{on:false})}}};
}
