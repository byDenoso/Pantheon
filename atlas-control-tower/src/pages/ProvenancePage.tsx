import { PageHeader } from '../components/PageHeader';

export default function ProvenancePage(){
  return <div className="nexo-page">
    <PageHeader eyebrow="TRUST" title="Proveniência" description="Fontes, lineage, artifacts e readback. Aqui a pergunta é simples: de onde veio e consigo verificar?"/>
    <section className="nexo-empty-state"><h2>Cadeia de evidência</h2><p>Métricas serão verificáveis; nada de donut mágico de 92% porque alguém achou bonito.</p></section>
  </div>;
}
