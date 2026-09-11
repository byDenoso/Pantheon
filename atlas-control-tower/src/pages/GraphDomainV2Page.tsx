import {useEffect,useMemo,useState} from 'react';
import {Link,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {PageHeader} from '../components/PageHeader';
import {buildDomainNavigatorModel} from '../components/DomainNavigator/domain-model.mjs';
import {loadUniverseSource} from '../data/load-universe';
import {buildUniverseView} from '../data/universes-model';
import {GraphExplorer} from '../graph-engine/GraphExplorer';
import {domainProjection} from '../graph-engine/projection';
import {useLearningOverlay} from '../graph-engine/useLearningOverlay';
import type {GraphNode} from '../graph-engine/types';

export default function GraphDomainV2Page(){
 const route=useParams();const domainId=route.domainId||'science';const navigate=useNavigate();const [params,setParams]=useSearchParams();
 const [graph,setGraph]=useState<any>();const selectedId=params.get('entity');const selectedEdgeId=params.get('edge');const learning=params.get('learning')==='1';
 useEffect(()=>{let active=true;setGraph(undefined);void loadUniverseSource(domainId).then(value=>{if(active)setGraph(value)});return()=>{active=false}},[domainId]);
 const view=useMemo(()=>buildUniverseView(domainId,graph??null),[domainId,graph]);
 const model=useMemo(()=>buildDomainNavigatorModel(domainId,graph??null),[domainId,graph]);
 const projection=useMemo(()=>domainProjection(domainId,model),[domainId,model]);
 const learningEdges=useLearningOverlay(projection.nodes);
 const selectNode=(id:string|null)=>{const next=new URLSearchParams(params);next.delete('edge');if(id)next.set('entity',id);else next.delete('entity');setParams(next,{replace:true})};
 const selectEdge=(id:string|null)=>{const next=new URLSearchParams(params);next.delete('entity');if(id)next.set('edge',id);else next.delete('edge');setParams(next,{replace:true})};
 const open=(node:GraphNode)=>{if(node.type!=='SUBGRAPH')return;const next=new URLSearchParams(params);next.delete('entity');next.delete('edge');navigate({pathname:'/graphs/'+domainId+'/'+node.id,search:next.toString()})};
 const toggle=(value:boolean)=>{const next=new URLSearchParams(params);if(value)next.set('learning','1');else{next.delete('learning');next.delete('edge')}setParams(next,{replace:true})};
 return <div className="nexo-page graphs-page"><nav className="nexo-breadcrumb"><Link to="/graphs">NEXO</Link><span>/</span><b>{view.label}</b></nav><PageHeader eyebrow="DOMÍNIO" title={view.label} description="Entre nos subgrafos sem abandonar o contexto estrutural."/>{graph===undefined?<section className="nexo-empty-state"><h2>Carregando subgrafos</h2></section>:null}{graph===null?<section className="nexo-empty-state"><h2>Subgrafos indisponíveis</h2><p>Nenhuma estrutura foi sintetizada.</p></section>:null}{graph&&model.domains.length?<GraphExplorer projection={projection} learningEdges={learningEdges} learning={learning} selectedId={selectedId} selectedEdgeId={selectedEdgeId} onSelect={selectNode} onSelectEdge={selectEdge} onOpen={open} onToggleLearning={toggle}/>:null}{graph&&!model.domains.length?<section className="nexo-empty-state"><h2>Nenhum subgrafo publicado</h2></section>:null}</div>;
}
