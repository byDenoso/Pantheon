import {writeFile} from 'node:fs/promises';
const base=process.env.NEXO_VERIFY_URL;
if(!base||new URL(base).protocol!=='https:')throw new Error('NEXO_VERIFY_URL must be an HTTPS deployment URL.');
const bypass=process.env.VERCEL_AUTOMATION_BYPASS_SECRET?{'x-vercel-protection-bypass':process.env.VERCEL_AUTOMATION_BYPASS_SECRET}:{};
async function read(path,authenticated=false){const r=await fetch(new URL(path,base),{redirect:'error',signal:AbortSignal.timeout(20000),headers:{...bypass,...(authenticated&&process.env.NEXO_QA_COOKIE?{Cookie:process.env.NEXO_QA_COOKIE}:{})}});if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);return path==='/'?r.text():r.json();}
const html=await read('/');if(!html.includes('NEXO ONE'))throw new Error('Shell missing.');
const pub=await read('/api/world');if(pub.access!=='PUBLIC'||pub.items.some(i=>i.source!=='github'))throw new Error('Public access boundary failed.');
const report={url:base,checkedAt:new Date().toISOString(),publicBoundary:'pass',shell:'pass',operational:'blocked',truthGraph:'blocked'};
if(process.argv.includes('--operational')){
  if(!process.env.NEXO_QA_COOKIE)throw new Error('Authenticated QA session is required for operational acceptance.');
  const h=await read('/api/health',true);if(h.status!=='HEALTHY'||h.access!=='PRIVATE')throw new Error('Private coverage gate not passed.');
  const w=await read('/api/world',true);if(w.providers.length!==7||w.providers.some(p=>p.status!=='AVAILABLE'||p.partial)||w.issues.length)throw new Error('Provider acceptance gate failed.');
  const graph=w.truthGraph, required=['source_ref','fingerprint','checked_at','authority','provider','capability','explanation'];
  if(!graph?.fingerprint||!Array.isArray(graph.results)||!Array.isArray(graph.material_conflicts))throw new Error('TruthGraph contract missing.');
  if(graph.results.some(row=>required.some(key=>row[key]==null||row[key]==='')))throw new Error('TruthGraph finding missing required evidence.');
  const olympus=graph.results.find(row=>row.domain==='OLYMPUS');
  if(!olympus||olympus.status!=='CONFLICT'||olympus.provider?.expected!=='drive'||olympus.provider?.actual!=='nexo'||!String(olympus.authority?.canonical_truth||'').toLowerCase().includes('drive'))throw new Error('Olympus authority conflict readback failed.');
  if(!graph.material_conflicts.some(row=>row.domain==='OLYMPUS'&&row.fingerprint===olympus.fingerprint))throw new Error('Olympus material conflict projection missing.');
  report.operational='pass';report.truthGraph='pass';report.truthGraphFingerprint=graph.fingerprint;report.olympusFingerprint=olympus.fingerprint;
}
await writeFile('verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
