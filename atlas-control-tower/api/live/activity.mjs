import {createTowerGithubGateway} from '../../lib/tower-github-gateway.mjs';

function send(res,body,status=200){
  res.statusCode=status;
  res.setHeader?.('Content-Type','application/json; charset=utf-8');
  res.setHeader?.('Cache-Control','no-store');
  res.setHeader?.('X-Content-Type-Options','nosniff');
  return res.end?.(JSON.stringify(body));
}

function list(value,...keys){
  if(Array.isArray(value)) return value;
  for(const key of keys) if(Array.isArray(value?.[key])) return value[key];
  return [];
}

function timestamp(item){
  for(const key of ['observed_at','updated_at','completed_at','created_at','timestamp','at']){
    const value=Date.parse(String(item?.[key]||''));
    if(Number.isFinite(value)) return value;
  }
  return 0;
}

export default async function liveActivity(req,res){
  if(String(req?.method||'GET').toUpperCase()!=='GET') return send(res,{error:'METHOD_NOT_ALLOWED'},405);
  const gateway=createTowerGithubGateway();
  try{
    const [workIndex,tests,interdomain,receipts,reports]=await Promise.all([
      gateway.readJson('indexes/active-work.json'),
      gateway.listJsonDirectory('entities/test'),
      gateway.readJson('indexes/interdomain-active.json'),
      gateway.listJsonDirectory('mutations/receipts'),
      gateway.listJsonDirectory('runtime/reports')
    ]);
    const work=list(workIndex,'work','items','queue');
    const filaments=list(interdomain,'items','active','filaments','links');
    const changes=[...receipts.map(item=>({...item,_kind:'MUTATION_RECEIPT'})),...reports.map(item=>({...item,_kind:'RUNTIME_REPORT'}))]
      .sort((a,b)=>timestamp(b)-timestamp(a)).slice(0,30);
    return send(res,{
      ok:true,
      state:'LIVE',
      truth_owner:'TOWER_V06',
      generated_at:new Date().toISOString(),
      availability:{
        work_index:Boolean(workIndex),
        tests:true,
        interdomain_index:Boolean(interdomain),
        mutation_receipts:true,
        runtime_reports:true
      },
      data:{
        changes,
        next:work.slice(0,30),
        tests:tests.slice(0,30),
        filaments:filaments.slice(0,30)
      }
    });
  }catch(error){
    return send(res,{ok:false,state:'ERROR',truth_owner:'TOWER_V06',error:String(error?.message||error)},502);
  }
}
