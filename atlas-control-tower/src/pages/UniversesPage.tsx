import { PageHeader } from '../components/PageHeader';

export default function UniversesPage(){
  return <div className="nexo-page">
    <PageHeader eyebrow="CIÊNCIA" title="Universos" description="Explore a ciência por contexto. O grafo é a visualização principal aqui, não uma aba solta chamada ‘grafos’."/>
    <section className="nexo-empty-state"><h2>Explorador científico</h2><p>Domínios, subdomínios, claims, testes, evidências e relações.</p></section>
  </div>;
}
