import type {Locale} from '../api.ts';
import type {PublicCampaign} from '../canonicalPublicCampaigns.ts';
export default function CampaignTimeline({campaign:c,locale}:{campaign:PublicCampaign;locale:Locale}){
  const en=locale==='en';const tests=c.tests;
  const steps=[
    {label:en?'Question':'Pergunta',observed:true,detail:en?'Published question':'Pergunta publicada'},
    {label:en?'Tests':'Testes',observed:tests.length>0,detail:tests.length?`${tests.length} ${en?'public records':'registros públicos'}`:en?'Awaiting publication':'Aguardando publicação'},
    {label:en?'Execution':'Execução',observed:tests.some(t=>['RUNNING','AWAITING_REVIEW','REVIEWED'].includes(t.stage)),detail:en?'Observed execution stage':'Etapa de execução observada'},
    {label:en?'Review':'Revisão',observed:tests.some(t=>['AWAITING_REVIEW','REVIEWED'].includes(t.stage)),detail:en?'Independent review stage':'Etapa de revisão independente'},
    {label:en?'Result':'Resultado',observed:tests.some(t=>t.stage==='REVIEWED'&&t.result!==null),detail:en?'Reviewed public result':'Resultado público revisado'},
    {label:en?'Closure':'Encerramento',observed:c.closure!==null,detail:en?'Recorded closure':'Encerramento registrado'},
  ];
  return <div className="nexo-campaign-journey"><h4>{en?'Investigation pathway':'Percurso da investigação'}</h4><ol>{steps.map(s=><li key={s.label} data-observed={s.observed}><span className="nexo-journey-dot" aria-hidden="true"/><strong>{s.label}</strong><small>{s.observed?s.detail:en?'Not recorded in the public view':'Ainda não registrado na visão pública'}</small></li>)}</ol><p className="nexo-source-note">{en?'The pathway shows stages present in the public records. Tests may be at different stages; it is not an estimate of time remaining.':'O percurso mostra etapas presentes nos registros públicos. Os testes podem estar em etapas diferentes; ele não estima o tempo restante.'}</p></div>;
}
