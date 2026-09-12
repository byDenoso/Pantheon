import { useCallback, useEffect, useMemo, useState } from 'react';
import { createConfiguredApi } from '../api/client';
import { parseEntity, parseHealth, parseState } from '../api/adapters';
import type { AtlasApiClient, EntityRead, HealthPayload, StatePayload } from '../api/types';
import { createSession } from '../../lib/graph-session.mjs';
import type { AtlasGraph, AtlasNode } from '../scene/types';

export type AtlasUiState={
  graph:AtlasGraph|null;
  summary:StatePayload|null;
  focusId:string;
  selectedId:string|null;
  selectedEntity:EntityRead|null;
  path:Array<{id:string;label?:string}>;
  syncing:boolean;
  loading:boolean;
  error:string|null;
  health:HealthPayload|null;
};

export type AtlasActions = {
  select: (node: AtlasNode) => void;
  open: (node: AtlasNode) => Promise<AtlasGraph|null>;
  home: () => Promise<AtlasGraph|null>;
  back: () => Promise<AtlasGraph|null> | null;
  more: () => Promise<AtlasGraph|null>;
  sync: () => Promise<unknown> | null;
  setDepth: (value: number) => Promise<AtlasGraph|null> | null;
  search: (query: string) => Promise<AtlasGraph|null>;
  clearFilters: () => Promise<AtlasGraph|null>;
  clearSelection: () => void;
  focusSystem: (id: string, label: string) => Promise<AtlasGraph|null>;
};

type SessionEventPayload = { error?: { message?: string } } | undefined;
type GraphSession = {
  state: { graph: AtlasGraph|null; summary: unknown; focus: string; selected: string|null; path: Array<{id:string;label?:string}>; syncing: boolean };
  on: (listener: (event: string, payload?: SessionEventPayload) => void) => () => void;
  restoreFilters: (filters: unknown) => void;
  refresh: () => Promise<AtlasGraph|null>;
  setDepth: (value: number) => Promise<AtlasGraph|null> | null;
  setFilters: (patch: Record<string, unknown>) => Promise<AtlasGraph|null>;
  clearFilters: () => Promise<AtlasGraph|null>;
  select: (id: string) => void;
  deselect: () => void;
  focusNode: (node: { id: string; label?: string }) => Promise<AtlasGraph|null>;
  home: () => Promise<AtlasGraph|null>;
  back: () => Promise<AtlasGraph|null> | null;
  more: () => Promise<AtlasGraph|null>;
  sync: () => Promise<unknown> | null;
};

type SessionFactory=(api:AtlasApiClient,options?:{limit?:number;depth?:number;onPersist?:(filters:unknown)=>void})=>GraphSession;

export function useAtlasSession(){
  const api=useMemo(()=>createConfiguredApi(),[]);
  const session=useMemo(()=>{
    const factory=createSession as SessionFactory;
    return factory(api,{
      limit:180,depth:1,
      onPersist:(filters:unknown)=>{try{localStorage.setItem('atlas.filters',JSON.stringify(filters))}catch{}}
    });
  },[api]);
  const [state,setState]=useState<AtlasUiState>(()=>({
    graph:null,summary:null,focusId:'system:NEXO',selectedId:null,selectedEntity:null,
    path:[{id:'system:NEXO',label:'NEXO'}],syncing:false,loading:true,error:null,health:null
  }));

  useEffect(()=>{
    try{session.restoreFilters(JSON.parse(localStorage.getItem('atlas.filters')||'{}'))}catch{}
    const snapshot=()=>setState(prev=>({...prev,
      graph:session.state.graph as AtlasGraph|null,
      summary:parseState(session.state.summary),
      focusId:session.state.focus,
      selectedId:session.state.selected,
      path:[...session.state.path],
      syncing:session.state.syncing
    }));
    const off=session.on((event:string,payload:SessionEventPayload)=>{
      if(event==='loading')setState(prev=>({...prev,loading:true,error:null}));
      if(event==='graph'){snapshot();setState(prev=>({...prev,loading:false,error:null}))}
      if(event==='summary')snapshot();
      if(event==='graph-error')setState(prev=>({...prev,loading:false,error:String(payload?.error?.message||'GRAPH_READ_FAILED')}));
      if(event==='summary-error')setState(prev=>({...prev,error:prev.error||'SUMMARY_READ_FAILED'}));
      if(event==='focus'||event==='select'||event==='deselect'||event==='syncing')snapshot();
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
  const open=useCallback((node:AtlasNode)=>session.focusNode({id:node.id,label:String(node.label||node.id)}),[session]);
  const home=useCallback(()=>session.home(),[session]);
  const back=useCallback(()=>session.back(),[session]);
  const more=useCallback(()=>session.more(),[session]);
  const sync=useCallback(()=>session.sync(),[session]);
  const setDepth=useCallback((value:number)=>session.setDepth(value),[session]);
  const search=useCallback((query:string)=>query.trim()?session.setFilters({q:query.trim()}):session.clearFilters(),[session]);
  const clearFilters=useCallback(()=>session.clearFilters(),[session]);
  const clearSelection=useCallback(()=>session.deselect(),[session]);
  const focusSystem=useCallback((id:string,label:string)=>session.focusNode({id,label}),[session]);

  return {api,session,state,actions:{select,open,home,back,more,sync,setDepth,search,clearFilters,clearSelection,focusSystem}};
}
