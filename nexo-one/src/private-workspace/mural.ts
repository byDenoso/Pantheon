// Private, read-only handoff and campaign cards from the same verified Tower generation.
// Neither list length nor lack of records is interpreted as an empty canonical queue.
type Dict = Record<string, unknown>;
export type MuralHandoff = {id:string; from:string; to:string; status:string; action:string; summary:string; why:string; entity:string; thread:string; updatedAt:string; refs:string[]};
export type MuralPost = {id:string; from:string; to:string; text:string; at:string; replyTo:string; replies:MuralPost[]; resolved:boolean; refs:string[]};
export type MuralCampaign = {id:string; title:string; question:string; proposedBy:string; proposedAt:string; refs:string[]};
const obj=(v:unknown):Dict=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Dict:{};
const arr=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const str=(v:unknown):string=>typeof v==='string'?v:'';
const items=(v:unknown):Dict[]=>arr(v).map(obj).filter(v=>Object.keys(v).length>0);
const refs=(v:unknown):string[]=>arr(v).map(row=>typeof row==='string'?row:str(obj(row).ref)).filter(Boolean);
const hidePeer=(v:unknown)=>/(^|[^a-z\d])peer([^a-z\d]|$)/i.test(JSON.stringify(v));
const byRecent=(a:{updatedAt:string},b:{updatedAt:string})=>b.updatedAt.localeCompare(a.updatedAt);
const states:Record<string,string>={HANDOFF_CREATED:'PENDING',HANDOFF_ACK:'ACK',HANDOFF_DONE:'DONE',HANDOFF_FAILED:'FAILED',HANDOFF_SUPERSEDED:'SUPERSEDED'};
export function privateMuralData(state:unknown){
  const root=obj(state), model=obj(root.read_model), seen=new Map<string,MuralHandoff>();
  const events=items(model.activity).filter(row=>typeof row.event_type==='string'&&Object.hasOwn(states,str(row.event_type)))
    .sort((a,b)=>str(a.created_at||a.at||a.timestamp).localeCompare(str(b.created_at||b.at||b.timestamp))||str(a.event_id).localeCompare(str(b.event_id)));
  for(const row of events){
    const id=str(row.handoff_id);if(!id)continue;
    const prior=seen.get(id),at=str(row.created_at||row.at||row.timestamp),eventType=str(row.event_type);
    const next:MuralHandoff={id,from:str(row.from_role)||prior?.from||'',to:str(row.to_role)||prior?.to||'',
      status:states[eventType]||prior?.status||'UNKNOWN',action:str(row.next_action)||prior?.action||'',
      summary:str(row.summary_plain)||prior?.summary||'',why:str(row.why_it_matters)||prior?.why||'',
      entity:str(row.entity_ref)||prior?.entity||'',thread:str(row.thread_id)||prior?.thread||'',
      updatedAt:at||prior?.updatedAt||'',refs:refs(row.evidence_refs).length?refs(row.evidence_refs):prior?.refs||[]};
    seen.set(id,next);
  }
  const requests=[...seen.values()].filter(row=>!hidePeer(row)).sort(byRecent);
  const evolution=obj(root.evolution),board=arr(evolution.board).length?evolution.board:obj(obj(model.evolution).board).posts;
  const posts=items(board).map(row=>({id:str(row.id),from:str(row.from),to:str(row.to),text:str(row.text),
    at:str(row.at),replyTo:str(row.reply_to),resolved:Boolean(row.resolved_at),refs:refs(row.refs),replies:[]} as MuralPost))
    .filter(row=>row.id&&!hidePeer(row));
  const responses=new Map<string,MuralPost[]>();
  for(const row of posts)if(row.replyTo)responses.set(row.replyTo,[...(responses.get(row.replyTo)||[]),row]);
  const messages=posts.filter(row=>!row.replyTo).map(row=>({...row,replies:(responses.get(row.id)||[]).sort((a,b)=>a.at.localeCompare(b.at))}))
    .sort((a,b)=>b.at.localeCompare(a.at));
  const campaigns=items(model.roadmaps).filter(row=>str(obj(row.charter).status).toUpperCase()==='PROPOSED')
    .map(row=>{const charter=obj(row.charter),semantic=obj(row.semantic);return {
      id:str(row.roadmap_id||row.id),title:str(row.title||row.id),question:str(charter.question||semantic.question_plain||row.question),
      proposedBy:str(charter.proposed_by),proposedAt:str(charter.proposed_at),refs:refs(charter.refs)
    } as MuralCampaign;}).filter(row=>row.id&&!hidePeer(row)).sort((a,b)=>b.proposedAt.localeCompare(a.proposedAt));
  return {requests,messages,campaigns,sourceRevision:str(root.source_revision),generatedAt:str(root.generated_at),
    handoffEvents:events.length,boardCount:posts.length};
}
