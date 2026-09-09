import {json,requireEnv,item} from './http.mjs';
export async function vercel({env,signal,now}) {
  requireEnv(env,'VERCEL_READ_TOKEN','VERCEL_PROJECT_ID');
  const q=new URLSearchParams({projectId:env.VERCEL_PROJECT_ID,limit:'30',...(env.VERCEL_TEAM_ID?{teamId:env.VERCEL_TEAM_ID}:{})});
  const data=await json(`https://api.vercel.com/v6/deployments?${q}`,{token:env.VERCEL_READ_TOKEN,signal});
  return {items:(data.deployments||[]).map(d=>item('vercel',d.uid,`${d.name} · ${d.state}`,`https://vercel.com/${env.VERCEL_TEAM_ID||'dashboard'}/${d.name}/${d.uid}`,now,{kind:'DEPLOYMENT',contextId:'ENGINEERING',summary:`${d.target||'preview'} · ${new Date(d.created).toISOString()}`,sourceRevision:d.ready||d.created})),partial:!!data.pagination?.next};
}
