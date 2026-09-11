type AnyRecord=Record<string,unknown>;
type Sources={ops?:unknown;runs?:unknown;health?:unknown};

const record=(value:unknown):AnyRecord=>value&&typeof value==='object'&&!Array.isArray(value)?value as AnyRecord:{};
const list=(value:unknown):AnyRecord[]=>Array.isArray(value)?value.map(record):[];
const text=(value:unknown):string=>typeof value==='string'?value:'';
const finite=(value:unknown):number|null=>{if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null};
const byRecent=(a:AnyRecord,b:AnyRecord)=>text(b.updatedAt).localeCompare(text(a.updatedAt));
const present=(value:unknown):string=>text(value)
 .replace(/Durable\s+Neon\s+Bridge\s+V1/gi,'Durable Bridge V1')
 .replace(/\bNeon\b/gi,'backend')
 .replace(/VERCEL_OIDC_NEON_DATA_API/gi,'runtime autenticado')
 .replace(/\bOIDC\b/gi,'identidade de runtime')
 .replace(/\bPostgREST\b/gi,'API de dados');

function normalizeRun(run:AnyRecord){
 const meta=record(run.metadata);
 return {
  id:text(run.id),label:text(run.label)||text(run.id),status:text(run.status),domain:text(run.domain),summary:present(run.summary),updatedAt:text(run.updatedAt),
  loop:text(meta.loop),checkpoint:text(meta.checkpoint),readbackVerified:meta.readback_verified===true,
  expectedOutcome:present(meta.expected_outcome),observedOutcome:present(meta.observed_outcome),
 };
}
function normalizeAction(action:AnyRecord){
 const meta=record(action.metadata);
 return {id:text(action.id),label:text(action.label)||text(action.id),status:text(action.status),domain:text(action.domain),summary:present(action.summary),updatedAt:text(action.updatedAt),priority:finite(meta.priority),reason:present(meta.blocker_reason)||present(action.summary)};
}
function normalizeEvent(event:AnyRecord){
 const meta=record(event.metadata);
 return {
  id:text(event.id),label:text(event.label)||text(event.id),status:text(event.status),domain:text(event.domain),summary:present(event.summary),updatedAt:text(event.updatedAt),
  eventType:text(meta.event_type),component:text(meta.component),readbackRequired:record(meta.payload).readback_required===true,
 };
}

function buildAutomations(runs:AnyRecord[]){
 const latest=new Map<string,ReturnType<typeof normalizeRun>>();
 for(const raw of [...runs].sort(byRecent)){
  const run=normalizeRun(raw);const key=run.loop||run.domain||run.label;
  if(key&&!latest.has(key))latest.set(key,run);
 }
 return [...latest.entries()].map(([name,run])=>({name,status:run.status,domain:run.domain,lastRun:run.updatedAt,readbackVerified:run.readbackVerified,checkpoint:run.checkpoint}));
}

export function buildOperationsModel({ops,runs,health}:Sources){
 const o=record(ops),counts=record(o.counts),h=record(health),dataSource=record(h.dataSource),semantic=record(h.semanticIndex);
 const runRows=list(runs).sort(byRecent);
 const actions=list(o.actions).map(normalizeAction).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 const allRuns=runRows.map(normalizeRun);
 const events=list(o.events).sort(byRecent).map(normalizeEvent);
 const blockers=actions.filter(item=>item.status.toUpperCase()==='BLOCKED').sort((a,b)=>(a.priority??99)-(b.priority??99)||b.updatedAt.localeCompare(a.updatedAt));
 const recentRuns=allRuns.slice(0,12);
 const blackBox=events.slice(0,12);
 const totalRuns=ops?finite(counts.runs):null,verified=ops?finite(counts.readbackVerified):null;
 return {
  available:Boolean(ops||runs||health),
  metrics:{
   runs:totalRuns,
   blocked:ops?finite(counts.blocked):null,
   success:ops?finite(counts.success):null,
   readback:totalRuns!==null&&verified!==null?`${verified}/${totalRuns}`:null,
  },
  actions,runs:allRuns,events,blockers,recentRuns,blackBox,automations:buildAutomations(runRows),
  integrity:{
   health:health?(h.ok===true?'PASS':'DEGRADED'):'UNAVAILABLE',
   contract:health?text(h.contract):'',
   freshness:health?text(dataSource.freshness):'',
   fallback:health?dataSource.usedFallback===true:null,
   semanticIndex:health&&semantic.available===true?finite(semantic.count):null,
   semanticIndexVersion:health?text(semantic.indexVersion):'',
  },
 };
}
