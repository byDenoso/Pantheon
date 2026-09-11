import {useEffect,useMemo,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router-dom';
import {PageHeader} from '../components/PageHeader';
import {loadUniversesSources} from '../data/load-universes';
import {buildUniversesModel} from '../data/universes-model';
import {GraphExplorer} from '../graph-engine/GraphExplorer';
import {atlasProjection} from '../graph-engine/projection';
import {useLearningOverlay} from '../graph-engine/useLearningOverlay';
import type {GraphNode} from '../graph-engine/types';

export default function GraphsV2Page(){
 const navigate=useNavigate();
 const [params,setParams]=useSearchParams();
 const [sources,setSources]=useState<any>();
 const selectedId=params.get('entity');
 const selectedEdgeId=params.get('edge');
 const learning=params.get('learning')==='1';
 useEffect(()=>{let active=true;void loadUniversesSources().then(value=>{if(active)setSources(value)});return()=>{active=false}},[]);
 const model=useMemo(()=>buildUniversesModel(sources?.root??null,sources?.details??{}),[sources]);
 const projection=useMemo(()=>atlasProjection(model),[model]);
 const learningEdges=useLearningOverlay(projection.nodes);
 const selectNode=(id:string|null)=>{const next=new URLSearchParams(params);next.delete('edge');if(id)next.set('entity',id);else next.delete('entity');setParams(next,{replace:true})};
 const selectEdge=(id:string|null)=>{const next=new URLSearchParams(params);next.delete('entity');if(id)next.set('edge',id);else next.delete('edge');setParams(next,{replace:true})};
 const open=(node:GraphNode)=>{if(node.type!=='DOMAIN')return;const next=new URLSearchParams(params);next.delete('entity');next.delete('edge');navigate({pathname:'/graphs/'+node.id,search:next.toString()})};
 const toggle=(value:boolean)=>{const next=new URLSearchParams(params);if(value)next.set('learning','1');else{next.delete('learning');next.delete('edge')}setParams(next,{replace:true})};
 return <div className="nexo-page graphs-page"><PageHeader eyebrow="ATLAS" title="Grafos" description="NEXO, domínios e subgrafos em uma única superfície navegável."/>{sources&&model.available?<GraphExplorer projection={projection} learningEdges={learningEdges} learning={learning} selectedId={selectedId} selectedEdgeId={selectedEdgeId} onSelect={selectNode} onSelectEdge={selectEdge} onOpen={open} onToggleLearning={toggle}/>:<section className="nexo-empty-state"><h2>{sources?'Mapa indisponível':'Carregando mapa'}</h2><p>Aguardando a projeção canônica.</p></section>}</div>;
}
