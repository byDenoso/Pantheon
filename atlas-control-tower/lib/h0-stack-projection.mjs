const text=v=>String(v??'').trim();
const arr=v=>Array.isArray(v)?v:[];
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&v.trim()&&Number.isFinite(Number(v))?Number(v):undefined;

export function extractH0StackMeasurement(record={}){
 const direct=num(record.h0??record.H0??record.hubbleConstant??record.hubble_constant);
 let h0=direct;
 if(h0===undefined){
  const source=[record.keyMetrics,record.key_metrics,record.summary,record.result].map(text).filter(Boolean).join(' | ');
  const matches=[...source.matchAll(/\bH0\s*=\s*(-?\d+(?:\.\d+)?)/gi)].map(m=>Number(m[1])).filter(Number.isFinite);
  const distinct=[...new Set(matches.map(String))].map(Number);
  if(distinct.length>1)return {unparsedReason:'AMBIGUOUS_H0'};
  if(distinct.length!==1)return {unparsedReason:'H0_NOT_PUBLISHED'};
  h0=distinct[0];
 }
 const id=text(record.id||record.testId||record.test_id);
 if(!id)return {unparsedReason:'MEASUREMENT_ID_MISSING'};
 return {
  id,
  stackLabel:text(record.stackLabel||record.stack_label||record.label||record.title||id)||id,
  domain:text(record.domain||arr(record.domains)[0])||undefined,
  primaryCampaign:text(record.primaryCampaign||record.primary_campaign)||undefined,
  h0,
  uncertaintyLow:num(record.uncertaintyLow??record.uncertainty_low??record.errorLow??record.error_low),
  uncertaintyHigh:num(record.uncertaintyHigh??record.uncertainty_high??record.errorHigh??record.error_high),
  uncertaintyLevel:text(record.uncertaintyLevel||record.uncertainty_level||record.intervalLabel||record.interval_label)||undefined,
  datasets:arr(record.datasets).map(text).filter(Boolean),
  baselineId:text(record.baselineId||record.baseline_id)||undefined,
  deltaH0:num(record.deltaH0??record.delta_h0),
  status:text(record.status)||undefined,
  updatedAt:text(record.lastVerified||record.last_verified||record.updatedAt||record.updated_at)||undefined,
  sourceRef:text(record.sourceRef||record.source_ref)||undefined
 };
}

export function buildH0StackProjection(records=[]){
 const measurements=[];let rejected=0;
 for(const record of arr(records)){const parsed=extractH0StackMeasurement(record);if(parsed?.unparsedReason){rejected++;continue}measurements.push(parsed)}
 measurements.sort((a,b)=>String(a.domain||'').localeCompare(String(b.domain||''),undefined,{numeric:true})||String(a.stackLabel).localeCompare(String(b.stackLabel))||String(a.id).localeCompare(String(b.id)));
 return {measurements,rejected};
}
