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
 const [selectedId,setSelectedId]=useState<string|null>(params.get('entity'));
 const learning=params.get('learning')==='1';
 useEffect(()=>{let active=true;void loadUniversesSources().then(value=>{if(active)setSources(value)});return()=>{active=false}},[]);
 const model=useMemo(()=>buildUniversesModel(sources?.root??null,sources?.details??{}),[sources]);
 const projection=useMemo(()=>atlasProjection(model),[model]);
 const learningEdges=useLearningOverlay(projection.nodes);
 const open=(node:GraphNode)=>{if(node.type==='DOMAIN')navigate('/graphs/'+node.id+(learning?'?learning=1':''))};
 const toggle=(value:boolean)=>{const next=new URLSearchParams(params);if(value)next.set('learning','1');else next.delete('learning');setParams(next,{replace:true})};
 return <div className="nexo-page graphs-page"><PageHeader eyebrow="ATLAS" title="Grafos" description="NEXO, domínios e subgrafos em uma única superfície navegável."/>{sources&&model.available?<GraphExplorer projection={projection} learningEdges={learningEdges} learning={learning} selectedId={selectedId} onSelect={setSelectedId} onOpen={open} onToggleLearning={toggle}/>:<section className="nexo-empty-state"><h2>{sources?'Mapa indisponível':'Carregando mapa'}</h2><p>Aguardando a projeção canônica.</p></section>}</div>;
}
