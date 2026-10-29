export function classify(item, now) {
  if (item.status === 'DONE') return {attention:'IGNORE',attentionReason:'Concluído na fonte.'};
  if (item.freshness.state !== 'LIVE') return {attention:'NOTICE',attentionReason:'Leitura anterior; confirme o estado na fonte.'};
  if (item.status === 'BLOCKED') return {attention:'ESCALATE',attentionReason:'Bloqueio explícito registrado na fonte.'};
  const due = item.dueAt ? Date.parse(item.dueAt) - now : Infinity;
  if (item.kind === 'EVENT') {
    const end = Date.parse(item.endAt || item.dueAt);
    if (Number.isFinite(end) && end < now) return {attention:'IGNORE',attentionReason:'Evento encerrado.'};
    return due <= 3600000 ? {attention:'ACT',attentionReason:'Evento em andamento ou começa em até 1 hora.'} : {attention:'NOTICE',attentionReason:'Compromisso agendado.'};
  }
  if (due < 0 && item.status && item.status !== 'DONE') return {attention:'ESCALATE',attentionReason:'Prazo registrado já passou.'};
  if (item.status === 'WAITING_OTHER') return {attention:'NOTICE',attentionReason:'Aguardando outra pessoa; sem ação automática.'};
  if (item.status === 'NEEDS_ME' && (due <= 86400000 || item.priority === 'HIGH')) return {attention:'ACT',attentionReason:due <= 86400000?'Prazo nas próximas 24 horas.':'Prioridade explícita na fonte.'};
  return {attention:'NOTICE',attentionReason:item.status === 'NEEDS_ME'?'Próximo passo disponível.':'Informação de contexto.'};
}
export const rankAttention = x => ({ESCALATE:0,ACT:1,NOTICE:2,IGNORE:3}[x.attention] ?? 4);
