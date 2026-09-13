const STAGES = ['INTENT', 'EXECUTION', 'RECEIPT', 'MUTATION', 'READBACK', 'HANDOFF'] as const;

export function AtividadePage() {
  return (
    <div className="page-wrap atividade-page">
      <h1>Atividade</h1>
      <p>Linha do tempo de execuções, recibos e readbacks. Nenhum item aparece como concluído antes do readback exato.</p>
      <ol className="activity-stage-list">
        {STAGES.map(stage => (
          <li key={stage}>{stage}</li>
        ))}
      </ol>
      <p role="status">DATA_UNAVAILABLE — requer a fachada privada (não conectada nesta build).</p>
    </div>
  );
}
