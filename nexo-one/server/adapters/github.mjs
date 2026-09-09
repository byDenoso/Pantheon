import {json,item,inferContext,ProviderError} from './http.mjs';
export async function github({env,signal,now,query}) {
  const repo=env.GITHUB_REPOSITORY||'byDenoso/Pantheon';
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo))throw new ProviderError('UNAVAILABLE');
  const options={token:env.GITHUB_TOKEN,signal,headers:{'X-GitHub-Api-Version':'2022-11-28','User-Agent':'nexo-one'}};
  const metadata=await json(`https://api.github.com/repos/${repo}`,options);
  const owner=repo.split('/')[0];
  const items=[item('github',`repo:${repo}`,metadata.full_name,metadata.html_url,now,{contextId:'ENGINEERING',summary:metadata.description||'Repositório conectado',sourceRevision:metadata.pushed_at})];
  const endpoint=query?`https://api.github.com/search/issues?${new URLSearchParams({q:`repo:${repo} ${query}`,per_page:'100'})}`:`https://api.github.com/repos/${repo}/issues?state=open&sort=updated&per_page=100`;
  const data=await json(endpoint,options),rows=Array.isArray(data)?data:data.items||[];
  items.push(...rows.map(x=>{const labels=(x.labels||[]).map(l=>typeof l==='string'?l:l.name);const mine=x.assignees?.some(a=>a.login.toLowerCase()===owner.toLowerCase());return item('github',`issue:${x.number}`,x.title,x.html_url,now,{kind:'ISSUE',contextId:inferContext(x.title,'ENGINEERING'),summary:`${x.pull_request?'Pull request':'Issue'} #${x.number} · ${x.state}`,status:x.state==='closed'?'DONE':labels.some(l=>/^blocked$/i.test(l))?'BLOCKED':mine?'NEEDS_ME':undefined,priority:labels.some(l=>/^(urgent|high priority|p0|p1)$/i.test(l))?'HIGH':'NORMAL',nextAction:'Revisar no GitHub',sourceRevision:x.updated_at});}));
  return {items:query?items.filter(x=>x.kind==='ISSUE'||x.title.toLowerCase().includes(query.toLowerCase())):items,partial:rows.length===100||!!data.incomplete_results};
}
