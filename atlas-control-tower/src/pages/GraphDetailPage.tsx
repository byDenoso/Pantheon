import {Link,useParams,useSearchParams} from 'react-router-dom';
import {PageHeader} from '../components/PageHeader';
import {StructuralExplorer} from '../components/StructuralExplorer';

export default function GraphDetailPage(){
 const params=useParams();
 const domainId=params.domainId||'science';
 const subgraphId=params.subgraphId||'';
 const [searchParams]=useSearchParams();
 const selectedEntity=searchParams.get('entity');
 const focusId=`domain:${subgraphId}`;
 return <div className="nexo-page subdomain-page graphs-page">
  <nav className="nexo-breadcrumb"><Link to="/graphs">Grafos</Link><span>/</span><Link to={'/graphs/'+domainId}>{domainId}</Link><span>/</span><b>{subgraphId}</b></nav>
  <PageHeader eyebrow="GRAFO DETALHADO" title={subgraphId||'Subgrafo'} description="Entidades, relações, claims, testes, evidências e fontes do recorte estrutural selecionado."/>
  <StructuralExplorer rootFocusId={focusId} initialSelectedId={selectedEntity}/>
 </div>;
}
