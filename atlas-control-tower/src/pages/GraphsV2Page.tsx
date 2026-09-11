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
 const [activeDomainId,setActiveDomainId]=useState<string|null>(null);
 const [expandedDomain,setExpandedDomain]=useState<GraphProjection|null>(null);
 const [activeSubgraphKey,setActiveSubgraphKey]=useState<string|null>(null);
 const [expandedDetail,setExpandedDetail]=useState<DetailBranch|null>(null);
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
  if(activeDomainId&&expandedDomain)current=graftProjection(current,activeDomainId,expandedDomain) as GraphProjection;
  if(activeSubgraphKey&&expandedDetail)current=graftProjection(current,expandedDetail.subgraphId,expandedDetail.projection) as GraphProjection;
  return current;
 },[baseProjection,activeDomainId,expandedDomain,activeSubgraphKey,expandedDetail]);
 const learningEdges=useLearningOverlay(projection.nodes);

 const toggleDomain=async(node:GraphNode)=>{
  if(activeDomainId===node.id){setActiveDomainId(null);setExpandedDomain(null);setActiveSubgraphKey(null);setExpandedDetail(null);return}
  setLoadingBranch(node.id);
  try{
   const graph=await loadUniverseSource(node.id);if(!graph)return;
   const domainModel=buildDomainNavigatorModel(node.id,graph);
   setActiveDomainId(node.id);setExpandedDomain(domainProjection(node.id,domainModel));setActiveSubgraphKey(null);setExpandedDetail(null);
  }finally{setLoadingBranch(current=>current===node.id?null:current)}
 };

 const toggleSubgraph=async(node:GraphNode)=>{
  const domainId=activeDomainId||'';if(!domainId)return;
  const key=`${domainId}/${node.id}`;
  if(activeSubgraphKey===key){setActiveSubgraphKey(null);setExpandedDetail(null);return}
  setLoadingBranch(node.id);
  try{
   const graph=await api.graph({focus:`domain:${node.id}`,depth:2,limit:220});
   setActiveSubgraphKey(key);setExpandedDetail({domainId,subgraphId:node.id,projection:detailProjection(`domain:${node.id}`,graph)});
  }catch{/* keep current focused constellation visible */}
  finally{setLoadingBranch(current=>current===node.id?null:current)}
 };

 const selectNode=(id:string|null)=>{
  const next=new URLSearchParams(params);next.delete('edge');if(id)next.set('entity',id);else next.delete('entity');setParams(next,{replace:true});
  if(!id)return;const node=projection.nodes.find(candidate=>candidate.id===id);
  if(node?.type==='DOMAIN')void toggleDomain(node);
  if(node?.type==='SUBGRAPH')void toggleSubgraph(node);
 };
 const selectEdge=(id:string|null)=>{const next=new URLSearchParams(params);next.delete('entity');if(id)next.set('edge',id);else next.delete('edge');setParams(next,{replace:true})};
 const toggle=(value:boolean)=>{const next=new URLSearchParams(params);if(value)next.set('learning','1');else{next.delete('learning');next.delete('edge')}setParams(next,{replace:true})};
 return <div className="nexo-page graphs-page"><PageHeader eyebrow="ATLAS" title="Grafos" description="Clique em um domínio para focar sua constelação; clique em um subgrafo para abrir uma única ramificação local."/>{loadingBranch?<div className="graph-v2-branch-status" role="status">Reorganizando constelação…</div>:null}{sources&&model.available?<GraphExplorer projection={projection} learningEdges={learningEdges} learning={learning} selectedId={selectedId} selectedEdgeId={selectedEdgeId} onSelect={selectNode} onSelectEdge={selectEdge} onToggleLearning={toggle}/>:<section className="nexo-empty-state"><h2>{sources?'Mapa indisponível':'Carregando mapa'}</h2><p>Aguardando a projeção canônica.</p></section>}</div>;
}
