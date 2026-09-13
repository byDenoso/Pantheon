import { useCallback, useEffect, useMemo, useState } from 'react';
import { createConfiguredApi } from '../api/client';
import { parseEntity, parseHealth, parseState } from '../api/adapters';
import type { AtlasApiClient, EntityRead, HealthPayload, StatePayload } from '../api/types';
import { createSession } from '../../lib/graph-session.mjs';
import type { AtlasGraph, AtlasNode } from '../scene/types';

type SceneState={camera:Record<string,unknown>;zoom:number;yaw:number;pitch:number;expandedRelations:string[];visibleLayers:string[]};
type NavigationFrame=Record<string,unknown>;

export type AtlasUiState={
  graph:AtlasGraph|null;
  summary:StatePayload|null;
  focusId:string;
  selectedId:string|null;
  selectedEntity:EntityRead|null;
  path:Array<{id:string;label?:string}>;
  scene:SceneState;
  navigationStack:NavigationFrame[];
  navigationIndex:number;
  pins:string[];
  compare:string[];
  syncing:boolean;
  loading:boolean;
  error:string|null;
  health:HealthPayload|null;
};

export type AtlasActions = {
  select:(node:AtlasNode)=>void;
  open:(node:AtlasNode)=>Promise<AtlasGraph|null>;
  home:()=>Promise<AtlasGraph|null>;
  back:()=>Promise<AtlasGraph|null>|null;
  forward:()=>Promise<AtlasGraph|null>|null;
  more:()=>Promise<AtlasGraph|null>;
  sync:()=>Promise<unknown>|null;
  setDepth:(value:number)=>Promise<AtlasGraph|null>|null;
  search:(query:string)=>Promise<AtlasGraph|null>;
  clearFilters:()=>Promise<AtlasGraph|null>;
  clearSelection:()=>void;
  focusSystem:(id:string,label:string)=>Promise<AtlasGraph|null>;
  setSceneState:(patch:Partial<SceneState>)=>SceneState;
  pin:(id:string)=>string[];
  unpin:(id:string)=>string[];
  toggleCompare:(id:string)=>string[];
};

type SessionEventPayload={error?:{message?:string}}|undefined;
type RawSessionState={
  graph:AtlasGraph|null;summary:unknown;focus:string;selected:string|null;path:Array<{id:string;label?:string}>;syncing:boolean;
  scene:SceneState;navigationStack:NavigationFrame[];navigationIndex:number;pins:string[];compare:string[];
};
type GraphSession={
  state:RawSessionState;
  on:(listener:(event:string,payload?:SessionEventPayload)=>void)=>()=>void;
  restoreFilters:(filters:unknown)=>void;
  refresh:()=>Promise<AtlasGraph|null>;
  setDepth:(value:number)=>Promise<AtlasGraph|null>|null;
  setFilters:(patch:Record<string,unknown>)=>Promise<AtlasGraph|null>;
  clearFilters:()=>Promise<AtlasGraph|null>;
  select:(id:string)=>void;
  deselect:()=>void;
  focusNode:(node:{id:string;label?:string;navigationKind?:'cross-domain'})=>Promise<AtlasGraph|null>;
  home:()=>Promise<AtlasGraph|null>;
  back:()=>Promise<AtlasGraph|null>|null;
  forward:()=>Promise<AtlasGraph|null>|null;
  more:()=>Promise<AtlasGraph|null>;
  sync:()=>Promise<unknown>|null;
  setSceneState:(patch:Partial<SceneState>)=>SceneState;
  pin:(id:string)=>string[];
  unpin:(id:string)=>string[];
  toggleCompare:(id:string)=>string[];
};

type SessionFactory=(api:AtlasApiClient,options?:{limit?:number;depth?:number;onPersist?:(filters:unknown)=>void})=>GraphSession;
const initialScene:SceneState={camera:{},zoom:1,yaw:0,pitch:0,expandedRelations:[],visibleLayers:['hierarchy','relations']};

export function useAtlasSession(){
  const api=useMemo(()=>createConfiguredApi(),[]);
  const session=useMemo(()=>{
    const factory=createSession as SessionFactory;
    return factory(api,{limit:180,depth:1,onPersist:(filters:unknown)=>{try{localStorage.setItem('atlas.filters',JSON.stringify(filters))}catch{}}});
  },[api]);
  const [state,setState]=useState<AtlasUiState>(()=>({
    graph:null,summary:null,focusId:'system:NEXO',selectedId:null,selectedEntity:null,path:[{id:'system:NEXO',label:'NEXO'}],
    scene:initialScene,navigationStack:[],navigationIndex:0,pins:[],compare:[],syncing:false,loading:true,error:null,health:null
  }));

  useEffect(()=>{
    try{session.restoreFilters(JSON.parse(localStorage.getItem('atlas.filters')||'{}'))}catch{}
    const snapshot=()=>setState(prev=>({...prev,
      graph:session.state.graph as AtlasGraph|null,
      summary:parseState(session.state.summary),
      focusId:session.state.focus,
      selectedId:session.state.selected,
      path:[...session.state.path],
      scene:{...session.state.scene,camera:{...session.state.scene.camera},expandedRelations:[...session.state.scene.expandedRelations],visibleLayers:[...session.state.scene.visibleLayers]},
      navigationStack:[...session.state.navigationStack],navigationIndex:session.state.navigationIndex,
      pins:[...session.state.pins],compare:[...session.state.compare],syncing:session.state.syncing
    }));
    const off=session.on((event:string,payload:SessionEventPayload)=>{
      if(event==='loading')setState(prev=>({...prev,loading:true,error:null}));
      if(event==='graph'){snapshot();setState(prev=>({...prev,loading:false,error:null}))}
      if(event==='summary')snapshot();
      if(event==='graph-error')setState(prev=>({...prev,loading:false,error:String(payload?.error?.message||'GRAPH_READ_FAILED')}));
      if(event==='summary-error')setState(prev=>({...prev,error:prev.error||'SUMMARY_READ_FAILED'}));
      if(['focus','select','deselect','syncing','scene','investigation'].includes(event))snapshot();
    });
    void session.refresh();
    void api.health().then((health:unknown)=>setState(prev=>({...prev,health:parseHealth(health)}))).catch(()=>{});
    return()=>{void off()};
  },[api,session]);

  useEffect(()=>{
    if(!state.selectedId){setState(prev=>prev.selectedEntity===null?prev:{...prev,selectedEntity:null});return}
    let live=true;
    void api.entity(state.selectedId).then((entity:unknown)=>{if(live)setState(prev=>({...prev,selectedEntity:parseEntity(entity)}))}).catch(()=>{if(live)setState(prev=>({...prev,selectedEntity:null}))});
    return()=>{live=false};
  },[api,state.selectedId]);

  const select=useCallback((node:AtlasNode)=>session.select(node.id),[session]);
  const open=useCallback((node:AtlasNode)=>session.focusNode({id:node.id,label:String(node.label||node.id),navigationKind:node.navigationKind==='cross-domain'?'cross-domain':undefined}),[session]);
  const home=useCallback(()=>session.home(),[session]);
  const back=useCallback(()=>session.back(),[session]);
  const forward=useCallback(()=>session.forward(),[session]);
  const more=useCallback(()=>session.more(),[session]);
  const sync=useCallback(()=>session.sync(),[session]);
  const setDepth=useCallback((value:number)=>session.setDepth(value),[session]);
  const search=useCallback((query:string)=>query.trim()?session.setFilters({q:query.trim()}):session.clearFilters(),[session]);
  const clearFilters=useCallback(()=>session.clearFilters(),[session]);
  const clearSelection=useCallback(()=>session.deselect(),[session]);
  const focusSystem=useCallback((id:string,label:string)=>session.focusNode({id,label}),[session]);
  const setSceneState=useCallback((patch:Partial<SceneState>)=>session.setSceneState(patch),[session]);
  const pin=useCallback((id:string)=>session.pin(id),[session]);
  const unpin=useCallback((id:string)=>session.unpin(id),[session]);
  const toggleCompare=useCallback((id:string)=>session.toggleCompare(id),[session]);

  return {api,session,state,actions:{select,open,home,back,forward,more,sync,setDepth,search,clearFilters,clearSelection,focusSystem,setSceneState,pin,unpin,toggleCompare}};
}
