import {useEffect,useMemo,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {createApi} from '../../lib/atlas-api.mjs';
import {PageHeader} from '../components/PageHeader';
import {buildDomainNavigatorModel} from '../components/DomainNavigator/domain-model.mjs';
import {loadUniverseSource} from '../data/load-universe';
import {loadUniversesSources} from '../data/load-universes';
import {buildUniversesModel} from '../data/universes-model';
import {GraphExplorer} from '../graph-engine/GraphExplorer';
import {graftProjection} from '../graph-engine/expansion.mjs';
import {atlasProjection,detailProjection,domainProjection} from '../graph-engine/projection';
import {useLearningOverlay} from '../graph-engine/useLearningOverlay';
import type {GraphNode,GraphProjection} from '../graph-engine/types';

type DetailBranch={domainId:string;subgraphId:string;projection:GraphProjection};

export default function GraphsV2Page(){
 const [params,setParams]=useSearchParams();
 const [sources,setSources]=useState<any>();
 const [expandedDomains,setExpandedDomains]=useState<Record<string,GraphProjection>>({});
 const [expandedDetails,setExpandedDetails]=useState<Record<string,DetailBranch>>({});
 const [loadingBranch,setLoadingBranch]=useState<string|null>(null);
 const api=useMemo(()=>createApi(),[]);
 const selectedId=params.get('entity');
 const selectedEdgeId=params.get('edge');
 const learning=params.get('learning')==='1';
 useEffect(()=>{let active=true;void loadUniversesSources().then(value=>{if(active)setSources(value)});return()=>{active=false}},[]);
 const model=useMemo(()=>buildUniversesModel(sources?.root??null,sources?.details??{}),[sources]);
 const baseProjection=useMemo(()=>atlasProjection(model),[model]);
 const projection=useMemo(()=>{
  let current=baseProjection;
  for(const [domainId,child] of Object.entries(expandedDomains))current=graftProjection(current,domainId,child) as GraphProjection;
  for(const branch of Object.values(expandedDetails))current=graftProjection(current,branch.subgraphId,branch.projection) as GraphProjection;
  return current;
 },[baseProjection,expandedDomains,expandedDetails]);
 const learningEdges=useLearningOverlay(projection.nodes);

 const toggleDomain=async(node:GraphNode)=>{
  if(expandedDomains[node.id]){
   setExpandedDomains(previous=>{const next={...previous};delete next[node.id];return next});
   setExpandedDetails(previous=>Object.fromEntries(Object.entries(previous).filter(([,branch])=>branch.domainId!==node.id)));
   return;
  }
  setLoadingBranch(node.id);
  try{
   const graph=await loadUniverseSource(node.id);
   if(!graph)return;
   const domainModel=buildDomainNavigatorModel(node.id,graph);
   setExpandedDomains(previous=>({...previous,[node.id]:domainProjection(node.id,domainModel)}));
  }finally{setLoadingBranch(current=>current===node.id?null:current)}
 };

 const toggleSubgraph=async(node:GraphNode)=>{
  const domainId=(node.parentId&&expandedDomains[node.parentId]?node.parentId:Object.entries(expandedDomains).find(([,child])=>child.nodes.some(candidate=>candidate.id===node.id))?.[0])||'';
  if(!domainId)return;
  const key=`${domainId}/${node.id}`;
  if(expandedDetails[key]){
   setExpandedDetails(previous=>{const next={...previous};delete next[key];return next});
   return;
  }
  setLoadingBranch(node.id);
  try{
   const graph=await api.graph({focus:`domain:${node.id}`,depth:2,limit:220});
   const child=detailProjection(`domain:${node.id}`,graph);
   setExpandedDetails(previous=>({...previous,[key]:{domainId,subgraphId:node.id,projection:child}}));
  }catch{/* keep the current graph visible on a failed branch read */}
  finally{setLoadingBranch(current=>current===node.id?null:current)}
 };

 const selectNode=(id:string|null)=>{
  const next=new URLSearchParams(params);next.delete('edge');if(id)next.set('entity',id);else next.delete('entity');setParams(next,{replace:true});
  if(!id)return;
  const node=projection.nodes.find(candidate=>candidate.id===id);
  if(node?.type==='DOMAIN')void toggleDomain(node);
  if(node?.type==='SUBGRAPH')void toggleSubgraph(node);
 };
 const selectEdge=(id:string|null)=>{const next=new URLSearchParams(params);next.delete('entity');if(id)next.set('edge',id);else next.delete('edge');setParams(next,{replace:true})};
 const toggle=(value:boolean)=>{const next=new URLSearchParams(params);if(value)next.set('learning','1');else{next.delete('learning');next.delete('edge')}setParams(next,{replace:true})};
 return <div className="nexo-page graphs-page"><PageHeader eyebrow="ATLAS" title="Grafos" description="Clique em um domínio ou subgrafo para abrir suas ramificações no próprio mapa."/>{loadingBranch?<div className="graph-v2-branch-status" role="status">Abrindo ramificações…</div>:null}{sources&&model.available?<GraphExplorer projection={projection} learningEdges={learningEdges} learning={learning} selectedId={selectedId} selectedEdgeId={selectedEdgeId} onSelect={selectNode} onSelectEdge={selectEdge} onToggleLearning={toggle}/>:<section className="nexo-empty-state"><h2>{sources?'Mapa indisponível':'Carregando mapa'}</h2><p>Aguardando a projeção canônica.</p></section>}</div>;
}
