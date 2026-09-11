import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { StructuralExplorer } from '../components/StructuralExplorer';

export default function SubdomainPage(){
 const {universeId='science',subdomainId=''}=useParams();
 const [searchParams]=useSearchParams();
 const selectedEntity=searchParams.get('entity');
 const focusId=universeId.toLowerCase()==='science'?`domain:${subdomainId}`:`${universeId}:${subdomainId}`;
 return <div className="nexo-page subdomain-page">
  <nav className="nexo-breadcrumb"><Link to="/universes">Universos</Link><span>/</span><Link to={`/universes/${universeId}`}>{universeId}</Link><span>/</span><b>{subdomainId}</b></nav>
  <PageHeader eyebrow={universeId.toUpperCase()} title={subdomainId||'Subdomínio'} description="Conhecimento estrutural, testes, evidências e fontes no mesmo recorte. O mapa existe aqui porque aqui ele responde uma pergunta concreta."/>
  <StructuralExplorer rootFocusId={focusId} initialSelectedId={selectedEntity}/>
 </div>;
}
