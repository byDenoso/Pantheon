import { PageHeader } from '../components/PageHeader';

export default function OverviewPage(){
  return <div className="nexo-page">
    <PageHeader title="Visão geral" description="Mudanças, bloqueios, estado científico e operacional. Sem grafo competindo pela sua atenção."/>
    <section className="nexo-empty-state">
      <span className="nexo-empty-kicker">PRÓXIMO BLOCO</span>
      <h2>Command center orientado a decisão</h2>
      <p>Os cartões desta tela serão alimentados pelos contratos canônicos já existentes.</p>
    </section>
  </div>;
}
