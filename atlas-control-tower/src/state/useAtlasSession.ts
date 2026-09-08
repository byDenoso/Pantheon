import { useCallback, useEffect, useMemo, useState } from 'react';
import { createApi } from '../../lib/atlas-api.mjs';
import { createSession } from '../../lib/graph-session.mjs';
import type { AtlasGraph, AtlasNode } from '../scene/types';

export type AtlasUiState={
  graph:AtlasGraph|null;
  summary:any;
  focusId:string;
  selectedId:string|null;
  selectedEntity:any;
  path:Array<{id:string;label?:string}>;
  syncing:boolean;
  loading:boolean;
  error:string|null;
  health:any;
};

export function useAtlasSession(){
  const api=useMemo(()=>createApi(),[]);
  const session=useMemo(()=>createSession(api,{
    limit:180,depth:1,
    onPersist:(filters:unknown)=>{try{localStorage.setItem('atlas.filters',JSON.stringify(filters))}catch{}}
  }),[api]);
  const [state,setState]=useState<AtlasUiState>(()=>({
    graph:null,summary:null,focusId:'system:NEXO',selectedId:null,selectedEntity:null,
    path:[{id:'system:NEXO',label:'NEXO'}],syncing:false,loading:true,error:null,health:null
  }));

  useEffect(()=>{
    try{session.restoreFilters(JSON.parse(localStorage.getItem('atlas.filters')||'{}'))}catch{}
    const snapshot=()=>setState(prev=>({...prev,
      graph:session.state.graph as AtlasGraph|null,
      summary:session.state.summary,
      focusId:session.state.focus,
      selectedId:session.state.selected,
      path:[...session.state.path],
      syncing:session.state.syncing
    }));
    const off=session.on((event:string,payload:any)=>{
      if(event==='loading')setState(prev=>({...prev,loading:true,error:null}));
      if(event==='graph'){snapshot();setState(prev=>({...prev,loading:false,error:null}))}
      if(event==='summary')snapshot();
      if(event==='graph-error')setState(prev=>({...prev,loading:false,error:String(payload?.error?.message||'GRAPH_READ_FAILED')}));
      if(event==='summary-error')setState(prev=>({...prev,error:prev.error||'SUMMARY_READ_FAILED'}));
      if(event==='focus'||event==='select'||event==='deselect'||event==='syncing')snapshot();
    });
    void session.refresh();
    void api.health().then((health:any)=>setState(prev=>({...prev,health}))).catch(()=>{});
    return off;
  },[api,session]);

  useEffect(()=>{
    if(!state.selectedId){setState(prev=>prev.selectedEntity===null?prev:{...prev,selectedEntity:null});return}
    let live=true;
    void api.entity(state.selectedId).then((entity:any)=>{if(live)setState(prev=>({...prev,selectedEntity:entity}))}).catch(()=>{if(live)setState(prev=>({...prev,selectedEntity:null}))});
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
  const clearSelection=useCallback(()=>session.deselect(),[session]);
  const focusSystem=useCallback((id:string,label:string)=>session.focusNode({id,label}),[session]);

  return {api,session,state,actions:{select,open,home,back,more,sync,setDepth,search,clearSelection,focusSystem}};
}
