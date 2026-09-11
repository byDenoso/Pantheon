import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export default function SubdomainPage(){
  const {universeId,subdomainId}=useParams();
  return <div className="nexo-page">
    <PageHeader eyebrow={universeId?.toUpperCase()} title={subdomainId||'Subdomínio'} description="Recorte científico específico com relações e evidências preservando o contexto do universo pai."/>
    <section className="nexo-empty-state"><h2>Recorte científico</h2><p>Seleção e inspeção contextual entram no próximo ciclo.</p></section>
  </div>;
}
