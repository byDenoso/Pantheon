const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();
const slug=value=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const iso=value=>{const ms=Date.parse(text(value));return Number.isFinite(ms)?new Date(ms).toISOString():null;};

function isLiveAutomationRow(row){
  const name=upper(row.automation),status=upper(row.status);
  if(!name.startsWith('NEXO '))return false;
  if(name.includes('LEGACY')||name.includes('RETIRED'))return false;
  if(status.includes('RETIRED')||status.includes('SUPERSEDED'))return false;
  return true;
}

/**
 * AUTOMATION_HEALTH continua sendo dado canônico do ACTION_REGISTER.
 * Aqui ele vira somente ProviderHealth projetado para a UI, nunca Truth Owner.
 */
export function projectAutomationHealthProviders(rows=[]){
  return rows.filter(isLiveAutomationRow).map(row=>{
    const readback=upper(row.readback),status=upper(row.status),lastRun=upper(row.last_run_status);
    const healthy=(status.includes('ACTIVE')||status.includes('PASS'))&&!readback.includes('FAIL')&&!lastRun.includes('FAIL');
    const checked=iso(row.last_checked);
    return {
      id:`automation:${slug(row.automation)}`,
      label:text(row.automation),
      status:healthy?'AVAILABLE':'UNAVAILABLE',
      lastSuccessAt:healthy?checked:null,
      checkedAt:checked,
      revision:text(row.last_run_id)||checked||'UNREVISIONED',
      partial:false,
      count:null,
      message:[text(row.status),text(row.readback),text(row.last_run_status)].filter(Boolean).join(' · ')||'AUTOMATION_HEALTH sem evidência.',
      projectionRole:'NON_AUTHORITATIVE',
      sourceRef:'ACTION_REGISTER/AUTOMATION_HEALTH'
    };
  });
}
