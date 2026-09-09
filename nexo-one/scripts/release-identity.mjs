import {writeFile} from 'node:fs/promises';
const {TARGET_DEPLOYMENT,PREVIOUS_DEPLOYMENT,VERCEL_PROJECT_ID,VERCEL_ORG_ID,VERCEL_TOKEN}=process.env;
if(!/^dpl_[A-Za-z0-9]+$/.test(TARGET_DEPLOYMENT||'')||!/^dpl_[A-Za-z0-9]+$/.test(PREVIOUS_DEPLOYMENT||''))throw new Error('Exact deployment IDs required.');
async function get(path){const r=await fetch(`https://api.vercel.com${path}${path.includes('?')?'&':'?'}teamId=${encodeURIComponent(VERCEL_ORG_ID)}`,{headers:{Authorization:`Bearer ${VERCEL_TOKEN}`},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`Vercel identity read failed: ${r.status}`);return r.json();}
const [target,previous,current]=await Promise.all([get(`/v13/deployments/${TARGET_DEPLOYMENT}`),get(`/v13/deployments/${PREVIOUS_DEPLOYMENT}`),get('/v4/aliases/nexo-one-two.vercel.app')]);
for(const d of [target,previous])if(d.projectId!==VERCEL_PROJECT_ID||d.readyState!=='READY'||d.target!=='production')throw new Error('Deployment identity/ready/target gate failed.');
const currentId=current.deploymentId||current.deployment?.id;
if(process.argv.includes('--current')?currentId!==TARGET_DEPLOYMENT:currentId!==PREVIOUS_DEPLOYMENT)throw new Error('Production alias changed or mismatches expected deployment.');
if(!process.argv.includes('--current')&&TARGET_DEPLOYMENT===PREVIOUS_DEPLOYMENT)throw new Error('No staged candidate.');
await writeFile('deployment-identity.json',JSON.stringify({projectId:VERCEL_PROJECT_ID,target:TARGET_DEPLOYMENT,previous:PREVIOUS_DEPLOYMENT,current:currentId,stagedUrl:`https://${target.url}`,checkedAt:new Date().toISOString()},null,2));
