import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export default function UniversePage(){
  const {universeId}=useParams();
  return <div className="nexo-page">
    <PageHeader eyebrow="UNIVERSO" title={universeId||'Universo'} description="Mapa estrutural, resumo, claims, testes, evidências e fontes no mesmo contexto científico."/>
    <section className="nexo-empty-state"><h2>Mapa do universo</h2><p>O renderer R3F será carregado somente nesta área.</p></section>
  </div>;
}
