export const V3_MANIFEST_RELATIVE='../data/v3/current/manifest.json';

function fail(message){throw new Error(`Atlas V3 ${message}`)}

export function validateAtlasV3Snapshot(manifest,snapshot){
  if(!manifest||typeof manifest!=='object')fail('manifest inválido');
  if(manifest.authority!=='TOWER_V06')fail('authority inválida');
  if(manifest.projectionOnly!==true)fail('projectionOnly inválido');
  if(!snapshot||typeof snapshot!=='object'||!snapshot.manifest)fail('snapshot inválido');
  if(snapshot.manifest.authority!=='TOWER_V06')fail('snapshot authority inválida');
  if(snapshot.manifest.projectionOnly!==true)fail('snapshot projection inválida');
  if(snapshot.manifest.fingerprint!==manifest.fingerprint)fail('fingerprint divergente');
  if(!Array.isArray(snapshot.graph?.root?.nodes)||!Array.isArray(snapshot.graph?.root?.edges))fail('graph inválido');
  return snapshot;
}

async function readJson(url,fetcher){
  const response=await fetcher(url,{cache:'no-store'});
  if(!response.ok)fail(`${url.pathname} HTTP ${response.status}`);
  return response.json();
}

export async function loadAtlasV3Snapshot(baseUrl=globalThis.location?.href,fetcher=globalThis.fetch){
  if(!baseUrl)fail('base URL indisponível');
  if(typeof fetcher!=='function')fail('fetch indisponível');
  const manifestUrl=new URL(V3_MANIFEST_RELATIVE,baseUrl);
  const manifest=await readJson(manifestUrl,fetcher);
  if(manifest.contractVersion!=='ATLAS_PROJECTION_V3')fail('contract inválido');
  if(manifest.authority!=='TOWER_V06'||manifest.projectionOnly!==true)fail('manifest authority/projection inválido');
  if(!manifest.snapshotPath)fail('snapshotPath ausente');
  const snapshotUrl=new URL(manifest.snapshotPath,manifestUrl);
  const snapshot=await readJson(snapshotUrl,fetcher);
  validateAtlasV3Snapshot(manifest,snapshot);
  return {manifest,snapshot,manifestUrl,snapshotUrl};
}
