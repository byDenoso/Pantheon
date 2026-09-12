import {writeFile} from 'node:fs/promises';
const base=process.env.NEXO_VERIFY_URL;
if(!base||new URL(base).protocol!=='https:')throw new Error('NEXO_VERIFY_URL must be an HTTPS deployment URL.');
const headers={};
if(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)headers['x-vercel-protection-bypass']=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if(process.env.VERCEL_TRUSTED_OIDC_TOKEN)headers['x-vercel-trusted-oidc-idp-token']=process.env.VERCEL_TRUSTED_OIDC_TOKEN;
async function read(path){const r=await fetch(new URL(path,base),{redirect:'error',signal:AbortSignal.timeout(20000),headers});if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);return path==='/'?r.text():r.json();}
const html=await read('/');if(!html.includes('NEXO ONE'))throw new Error('Shell missing.');
const pub=await read('/api/world');if(pub.access!=='PUBLIC'||pub.items.some(i=>i.source!=='github'))throw new Error('Public access boundary failed.');
const report={url:base,checkedAt:new Date().toISOString(),publicBoundary:'pass',shell:'pass',operational:'blocked',truthGraph:'blocked',privacyBoundary:'blocked'};
if(process.argv.includes('--operational')){
  const h=await read('/api/health');if(h.access!=='PUBLIC')throw new Error('Public health boundary failed.');
  const system=await read('/api/system');
  if(system.contract_version!=='1'||!Array.isArray(system.findings)||!Array.isArray(system.capabilities))throw new Error('Public SystemState contract missing.');
  for(const key of ['actions','runs','inbox','filaments'])if(!Array.isArray(system[key])||system[key].length)throw new Error(`Public privacy boundary failed: ${key}`);
  const graph=pub.truthGraph, required=['source_ref','fingerprint','checked_at','authority','provider','capability','explanation'];
  if(!graph?.fingerprint||!Array.isArray(graph.results)||!Array.isArray(graph.material_conflicts))throw new Error('TruthGraph contract missing.');
  if(graph.results.some(row=>required.some(key=>row[key]==null||row[key]==='')))throw new Error('TruthGraph finding missing required evidence.');
  const olympus=graph.results.find(row=>row.domain==='OLYMPUS'),authority=String(olympus?.authority?.canonical_truth||'').toLowerCase();
  if(!olympus||olympus.status==='CONFLICT'||olympus.provider?.expected!=='nexo'||olympus.provider?.actual!=='nexo'||!authority.includes('ssot canonical')||!authority.includes('olympus'))throw new Error('Olympus canonical authority readback failed.');
  if(graph.material_conflicts.some(row=>row.domain==='OLYMPUS'))throw new Error('Olympus material authority conflict remains.');
  report.operational='pass';report.truthGraph='pass';report.privacyBoundary='pass';report.truthGraphFingerprint=graph.fingerprint;report.olympusFingerprint=olympus.fingerprint;report.systemFingerprint=system.bus?.fingerprint||null;
}
await writeFile('verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));