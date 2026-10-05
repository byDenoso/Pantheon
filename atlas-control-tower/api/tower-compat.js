const SOURCE='https://nexo-one-two.vercel.app/api/system';
const send=(res,status,payload)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','public, max-age=30');res.setHeader('X-Atlas-Authority','TOWER_V06');return res.end(JSON.stringify(payload))};
async function tower(){const r=await fetch(SOURCE,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('TOWER_PUBLIC_'+r.status);const s=await r.json();if(s?.science_projection_v1?.source?.authority!=='TOWER_V06')throw new Error('NON_TOWER_AUTHORITY');return s}
export default async function handler(req,res){if(req.method!=='GET')return send(res,405,{ok:false,error:'READ_ONLY_TOWER_V06'});const u=new URL(req.url||'/','https://atlas.local'),route=u.searchParams.get('route')||'status';try{const s=await tower(),base={authority:'TOWER_V06',sourceVersion:s.generated_at,fingerprint:s.bus?.fingerprint||null};
 if(route==='atlas')return send(res,200,{...base,graph:s.graph,filaments:s.filaments||[]});
 if(route==='runtime')return send(res,200,{...base,lanes:s.lanes||[],guardian:s.guardian||null,evolution:s.evolution||null,providers:s.providers||[]});
 if(route==='science')return send(res,200,{...base,science_projection_v1:s.science_projection_v1});
 if(route==='status')return send(res,200,{...base,status:'OK',guardian:s.guardian||null,generated_at:s.generated_at});
 return send(res,404,{...base,error:'NOT_FOUND'})}catch(e){return send(res,503,{ok:false,error:'TOWER_V06_UNAVAILABLE',detail:String(e?.message||e)})}}