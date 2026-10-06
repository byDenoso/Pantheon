// Synthetic UI-only fixture. Never imported by production entries.
import {compilePrivateTowerSystem} from '../../server/atlas/private-tower-system.mjs';
export function privateWorkspaceInput() {
  const at='2026-10-06T00:00:00.000Z';
  const domains=['SCIENCE','ENGINEERING','OLYMPUS'];
  const statuses=['RUNNING','BLOCKED_INPUT','DONE','READY','CHECKPOINTED','DONE','QUEUED','UNKNOWN'];
  const tests=domains.flatMap((domain,domainIndex)=>statuses.map((status,index)=>{
    const id=`SYNTHETIC-${domain}-${index+1}`;
    return {id,kind:'TEST',domain,private:true,title:`Exemplo sintético ${domainIndex+1}.${index+1}`,display_name:`Exemplo sintético ${domainIndex+1}.${index+1}`,question:`Como avaliar o exemplo sintético ${domainIndex+1}.${index+1}?`,status,
      campaign_id:`SYNTHETIC-CAMPAIGN-${domain}`,method:'Método ilustrativo da prévia. Não representa uma pesquisa real.',
      datasets:[{name:'Conjunto sintético de demonstração',version:'preview-1'}],
      ...(index===2?{verdict:'INCONCLUSIVE',result_meaning:'O exemplo é inconclusivo. Estes valores e textos servem somente para testar a interface.',review_state:'PENDING_REVIEW',result:{value:0,unit:'unidade sintética',uncertainty:1},limitations:['Dados inteiramente sintéticos.'],review:[{kind:'REFEREE_1',outcome:'PENDING',at}]}:{}),
      ...(index===5?{review_state:'CONTESTED',result_meaning:'Resultado sintético aguardando revisão.',verdict:'PROVISIONAL'}:{}),
      ...(status==='BLOCKED_INPUT'?{blocker:'Entrada sintética ainda não disponível.'}:{}),
      semantic:{domain_id:domain,display_name:`Exemplo sintético ${domainIndex+1}.${index+1}`,question_plain:`Como avaliar o exemplo sintético ${domainIndex+1}.${index+1}?`,subdomain_id:`preview-${Math.floor(index/4)}`,subdomain_label:`Grupo sintético ${Math.floor(index/4)+1}`},
      recipe:{id:'SYNTHETIC-RECIPE',version:1,steps:['Ler os dados sintéticos','Executar a rotina de demonstração','Registrar o resultado de demonstração']},recipe_ref:'synthetic://recipe',
      prereg:{metric:'Métrica de demonstração',threshold:1,criterion:{success:['Condição sintética'],kill:['Condição sintética alternativa']}},
      ...(status==='RUNNING'||status==='DONE'?{execution:{at,run_ref:'synthetic://run',runner:'Executor de demonstração'}}:{}),
      parents:index?[`SYNTHETIC-${domain}-${index}`]:domainIndex?[`SYNTHETIC-${domains[domainIndex-1]}-8`]:[],
      created_at:`2026-10-0${index%5+1}T00:00:00.000Z`,_source_path:`entities/test/${id}.json`};
  }));
  const work=[
    {id:'SYNTHETIC-WORK-RUN',action_id:'SYNTHETIC-ACTION-RUN',domain:'ENGINEERING',title:'Processamento sintético em execução',status:'RUNNING',runtime:'NEXO_KERNEL',required_operation:'READ',capability_id:'SYNTHETIC-CAP',next_action:'Aguardar o registro sintético.',private:true},
    {id:'SYNTHETIC-WORK-BLOCK',domain:'SCIENCE',title:'Entrada sintética ausente',status:'BLOCKED_INPUT',blocker:'A prévia representa uma entrada ainda ausente.',next_action:'Verificar a entrada no fluxo existente.',private:true},
    {id:'SYNTHETIC-WORK-HUMAN',domain:'OLYMPUS',title:'Decisão sintética de demonstração',status:'WAIT_DEPENDENCY',human_action_required:true,human_gate:{kind:'DECIDIR',question:'Qual caminho sintético deve ser usado na demonstração?'},blocker:'A fonte marcou explicitamente uma decisão humana.',next_action:'Responder pelo fluxo existente.',private:true},
    {id:'SYNTHETIC-WORK-WAIT',domain:'ENGINEERING',title:'Dependência sintética pendente',status:'WAIT_DEPENDENCY',blocker:'Aguardando outra tarefa sintética.',private:true},
  ];
  const records={tests,work,hypotheses:[],campaigns:domains.map(domain=>({id:`SYNTHETIC-CAMPAIGN-${domain}`,domain,title:'Campanha sintética de demonstração'})),roadmaps:[],lessons:[],interdomain:[],artifacts:[],events:[],capabilities:{},evolution:{},control:{},snapshot:{},coverage:{}};
  for(const key of ['tests','work','hypotheses','campaigns','roadmaps','lessons','interdomain','artifacts'])records.coverage[key]={status:'PRESENT',complete:true,count:records[key].length};
  return {records,revision:'sha256:'+'d'.repeat(64),generatedAt:at,sourceRef:'https://example.invalid/synthetic-private-preview'};
}
export const privateWorkspaceState=()=>compilePrivateTowerSystem(privateWorkspaceInput());
