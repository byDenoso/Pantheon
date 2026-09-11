import {useEffect,useMemo,useState} from 'react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {createApi} from '../../lib/atlas-api.mjs';
import {PageHeader} from '../components/PageHeader';
import {GraphRenderer} from '../graph-engine/GraphRenderer';
import {detailProjection} from '../graph-engine/projection';
import {useLearningOverlay} from '../graph-engine/useLearningOverlay';

export default function GraphDetailV2Page(){
 const route=useParams();const domainId=route.domainId||'science';const subgraphId=route.subgraphId||'';const rootFocus='domain:'+subgraphId;const [params,setParams]=useSearchParams();const api=useMemo(()=>createApi(),[]);const focus=params.get('focus')||rootFocus;const learning=params.get('learning')==='1';const selectedId=params.get('entity');const selectedEdgeId=params.get('edge');const [graph,setGraph]=useState<any>();
 useEffect(()=>{let active=true;setGraph(undefined);void api.graph({focus,depth:2,limit:220}).then(value=>{if(active)setGraph(value)}).catch(()=>{if(active)setGraph(null)});return()=>{active=false}},[api,focus]);
 const projection=useMemo(()=>{const next=detailProjection(focus,graph??null);next.breadcrumbs=[{id:'system:NEXO',label:'NEXO',path:'/graphs'},{id:domainId,label:domainId,path:'/graphs/'+domainId},{id:subgraphId,label:subgraphId,path:'/graphs/'+domainId+'/'+subgraphId}];return next},[domainId,focus,graph,subgraphId]);const learningEdges=useLearningOverlay(projection.nodes);
 const select=(id:string|null)=>{const next=new URLSearchParams(params);next.delete('edge');if(id)next.set('entity',id);else next.delete('entity');setParams(next,{replace:true})};const selectEdge=(id:string|null)=>{const next=new URLSearchParams(params);next.delete('entity');if(id)next.set('edge',id);else next.delete('edge');setParams(next,{replace:true})};const toggle=(value:boolean)=>{const next=new URLSearchParams(params);if(value)next.set('learning','1');else{next.delete('learning');next.delete('edge')}setParams(next,{replace:true})};
 return <div className="nexo-page graphs-page"><nav className="nexo-breadcrumb"><Link to="/graphs">NEXO</Link><span>/</span><Link to={'/graphs/'+domainId}>{domainId}</Link><span>/</span><b>{subgraphId}</b></nav><PageHeader eyebrow="REDE NEURAL" title={subgraphId||'Subgrafo'} description="Claims, testes, evidências e resultados permanecem na mesma superfície 3D; clique para inspecionar."/>{graph===undefined?<section className="nexo-empty-state"><h2>Carregando recorte</h2></section>:null}{graph===null?<section className="nexo-empty-state"><h2>Grafo indisponível</h2><p>O estado canônico foi preservado.</p></section>:null}{graph?<GraphRenderer projection={projection} learningEdges={learningEdges} learning={learning} selectedId={selectedId} selectedEdgeId={selectedEdgeId} onSelect={select} onSelectEdge={selectEdge} onToggleLearning={toggle}/>:null}</div>;
}
