import {useEffect,useMemo,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {PageHeader} from '../components/PageHeader';
import {SubgraphMap} from '../components/SubgraphMap';
import {buildDomainNavigatorModel} from '../components/DomainNavigator/domain-model.mjs';
import {loadUniverseSource} from '../data/load-universe';
import {buildUniverseView} from '../data/universes-model';

export default function GraphDomainPage(){
 const params=useParams();
 const domainId=params.domainId||'science';
 const [graph,setGraph]=useState<any>(undefined);
 useEffect(()=>{let live=true;setGraph(undefined);void loadUniverseSource(domainId).then(value=>{if(live)setGraph(value)});return()=>{live=false}},[domainId]);
 const view=useMemo(()=>buildUniverseView(domainId,graph??null),[domainId,graph]);
 const model=useMemo(()=>buildDomainNavigatorModel(domainId,graph??null),[domainId,graph]);
 const path='/graphs/'+domainId;
 return <div className="nexo-page graphs-page">
  <nav className="nexo-breadcrumb"><Link to="/graphs">Grafos</Link><span>/</span><b>{view.label}</b><span>/</span><b>Subgrafos</b></nav>
  <PageHeader eyebrow="SUBGRAFOS" title={view.label+' / Subgrafos'} description="Explore os recortes publicados e abra o grafo estrutural de cada um."/>
  {graph===undefined?<section className="nexo-empty-state"><h2>Carregando subgrafos</h2></section>:null}
  {graph&&model.domains.length?<SubgraphMap model={model} basePath={path}/>:null}
  {graph&&!model.domains.length?<section className="nexo-empty-state"><h2>Nenhum subgrafo publicado</h2><p>Este nível permanece vazio quando a fonte não publica recortes.</p></section>:null}
 </div>;
}
