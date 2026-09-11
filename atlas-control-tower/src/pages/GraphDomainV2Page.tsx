import {useEffect,useMemo,useState} from 'react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {createApi} from '../../lib/atlas-api.mjs';
import {PageHeader} from '../components/PageHeader';
import {buildDomainNavigatorModel} from '../components/DomainNavigator/domain-model.mjs';
import {loadUniverseSource} from '../data/load-universe';
import {buildUniverseView} from '../data/universes-model';
import {GraphRenderer} from '../graph-engine/GraphRenderer';
import {graftProjection} from '../graph-engine/expansion.mjs';
import {detailProjection,domainProjection} from '../graph-engine/projection';
import {useLearningOverlay} from '../graph-engine/useLearningOverlay';
import type {GraphNode,GraphProjection} from '../graph-engine/types';

export default function GraphDomainV2Page(){
 const route=useParams();const domainId=route.domainId||'science';const [params,setParams]=useSearchParams();const [graph,setGraph]=useState<any>();const [expandedDetails,setExpandedDetails]=useState<Record<string,GraphProjection>>({});const [loadingBranch,setLoadingBranch]=useState<string|null>(null);const api=useMemo(()=>createApi(),[]);const selectedId=params.get('entity');const selectedEdgeId=params.get('edge');const learning=params.get('learning')==='1';
 useEffect(()=>{let active=true;setGraph(undefined);setExpandedDetails({});void loadUniverseSource(domainId).then(value=>{if(active)setGraph(value)});return()=>{active=false}},[domainId]);
 const view=useMemo(()=>buildUniverseView(domainId,graph??null),[domainId,graph]);const model=useMemo(()=>buildDomainNavigatorModel(domainId,graph??null),[domainId,graph]);const baseProjection=useMemo(()=>domainProjection(domainId,model),[domainId,model]);const projection=useMemo(()=>{let current=baseProjection;for(const [subgraphId,child] of Object.entries(expandedDetails))current=graftProjection(current,subgraphId,child) as GraphProjection;return current},[baseProjection,expandedDetails]);const learningEdges=useLearningOverlay(projection.nodes);
 const toggleSubgraph=async(node:GraphNode)=>{if(expandedDetails[node.id]){setExpandedDetails(previous=>{const next={...previous};delete next[node.id];return next});return}setLoadingBranch(node.id);try{const detail=await api.graph({focus:`domain:${node.id}`,depth:2,limit:220});setExpandedDetails({[node.id]:detailProjection(`domain:${node.id}`,detail)})}catch{}finally{setLoadingBranch(current=>current===node.id?null:current)}};
 const selectNode=(id:string|null)=>{const repeated=Boolean(id&&selectedId===id);const next=new URLSearchParams(params);next.delete('edge');if(id)next.set('entity',id);else next.delete('entity');setParams(next,{replace:true});if(!id||!repeated)return;const node=projection.nodes.find(candidate=>candidate.id===id);if(node?.type==='SUBGRAPH')void toggleSubgraph(node)};
 const selectEdge=(id:string|null)=>{const next=new URLSearchParams(params);next.delete('entity');if(id)next.set('edge',id);else next.delete('edge');setParams(next,{replace:true})};const toggle=(value:boolean)=>{const next=new URLSearchParams(params);if(value)next.set('learning','1');else{next.delete('learning');next.delete('edge')}setParams(next,{replace:true})};
 return <div className="nexo-page graphs-page"><nav className="nexo-breadcrumb"><Link to="/graphs">NEXO</Link><span>/</span><b>{view.label}</b></nav><PageHeader eyebrow="DOMÍNIO" title={view.label} description="Selecione um subgrafo e clique novamente para abrir seus testes, resultados e relações como uma ramificação local."/>{loadingBranch?<div className="graph-v2-branch-status" role="status">Abrindo ramificações…</div>:null}{graph===undefined?<section className="nexo-empty-state"><h2>Carregando subgrafos</h2></section>:null}{graph===null?<section className="nexo-empty-state"><h2>Subgrafos indisponíveis</h2><p>Nenhuma estrutura foi sintetizada.</p></section>:null}{graph&&model.domains.length?<GraphRenderer projection={projection} learningEdges={learningEdges} learning={learning} selectedId={selectedId} selectedEdgeId={selectedEdgeId} onSelect={selectNode} onSelectEdge={selectEdge} onToggleLearning={toggle}/>:null}{graph&&!model.domains.length?<section className="nexo-empty-state"><h2>Nenhum subgrafo publicado</h2></section>:null}</div>;
}
