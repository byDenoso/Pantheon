import {createHash} from 'node:crypto';

export const PUBLIC_MANIFEST_V3_CONTRACT='NEXO_ATLAS_PUBLIC_MANIFEST_V3';
export const PUBLIC_MANIFEST_V3_ACCESS='PUBLIC_SANITIZED';
const SHA=/^[a-f0-9]{64}$/i;
const FINGERPRINT=/^sha256:[a-f0-9]{64}$/i;
const text=value=>String(value??'').trim();
const obj=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:null;
const hash=value=>createHash('sha256').update(String(value)).digest('hex');

function canonicalObject(value){
  if(Array.isArray(value))return value.map(canonicalObject);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalObject(value[key])]));
  return value;
}

function descriptor(name,value){
  const row=obj(value);
  if(!row)throw new Error(`PUBLIC_MANIFEST_V3_DESCRIPTOR_INVALID:${name}`);
  if(row.state==='DATA_UNAVAILABLE'){
    if(row.contract!==undefined||row.path!==undefined||row.sha256!==undefined)throw new Error(`PUBLIC_MANIFEST_V3_DESCRIPTOR_INVALID:${name}`);
    return {state:'DATA_UNAVAILABLE'};
  }
  if(row.state!=='READY'||!text(row.contract)||!text(row.path)||!SHA.test(text(row.sha256))||text(row.path).includes('..'))throw new Error(`PUBLIC_MANIFEST_V3_DESCRIPTOR_INVALID:${name}`);
  return {state:'READY',contract:text(row.contract),path:text(row.path),sha256:text(row.sha256).toLowerCase()};
}
function descriptors(value){
  const root=obj(value);
  if(!root)throw new Error('PUBLIC_MANIFEST_V3_DESCRIPTORS_INVALID');
  return Object.fromEntries(Object.keys(root).sort().map(name=>[name,descriptor(name,root[name])]));
}
function semanticPayload({authority,sourceVersion,artifacts,surfaces,completeness}){
  return canonicalObject({contract:PUBLIC_MANIFEST_V3_CONTRACT,access:PUBLIC_MANIFEST_V3_ACCESS,authority,sourceVersion,artifacts,surfaces,completeness:canonicalObject(completeness||{})});
}
export function publicManifestV3Fingerprint({authority='GOOGLE_DRIVE',sourceVersion='',artifacts={},surfaces={},completeness={}}={}){
  const normalizedArtifacts=descriptors(artifacts),normalizedSurfaces=descriptors(surfaces);
  return `sha256:${hash(JSON.stringify(semanticPayload({authority:String(authority),sourceVersion:String(sourceVersion||''),artifacts:normalizedArtifacts,surfaces:normalizedSurfaces,completeness})) )}`;
}
export function buildPublicManifestV3({authority='GOOGLE_DRIVE',sourceVersion='',sourceModifiedAt='',generatedAt='',artifacts={},surfaces={},completeness={}}={}){
  const normalizedArtifacts=descriptors(artifacts),normalizedSurfaces=descriptors(surfaces);
  if(normalizedArtifacts.srm?.state!=='READY')throw new Error('PUBLIC_MANIFEST_V3_SRM_REQUIRED');
  for(const name of ['projectionLedger','activityLedger','shards'])if(normalizedArtifacts[name]?.state!=='READY')throw new Error(`PUBLIC_MANIFEST_V3_${name.toUpperCase()}_REQUIRED`);
  if(normalizedSurfaces.graph?.state!=='READY')throw new Error('PUBLIC_MANIFEST_V3_GRAPH_REQUIRED');
  const root={
    contract:PUBLIC_MANIFEST_V3_CONTRACT,authority:String(authority),projectionOnly:true,access:PUBLIC_MANIFEST_V3_ACCESS,
    generatedAt:String(generatedAt||''),sourceModifiedAt:String(sourceModifiedAt||sourceVersion||''),sourceVersion:String(sourceVersion||''),
    fingerprint:'',artifacts:normalizedArtifacts,surfaces:normalizedSurfaces,completeness:canonicalObject(completeness||{})
  };
  root.fingerprint=publicManifestV3Fingerprint(root);
  return root;
}
export function validatePublicManifestV3(value){
  const root=obj(value);
  if(!root||root.contract!==PUBLIC_MANIFEST_V3_CONTRACT)throw new Error('PUBLIC_MANIFEST_V3_CONTRACT_INVALID');
  if(root.authority!=='GOOGLE_DRIVE'||root.projectionOnly!==true||root.access!==PUBLIC_MANIFEST_V3_ACCESS)throw new Error('PUBLIC_MANIFEST_V3_AUTHORITY_INVALID');
  if(!FINGERPRINT.test(text(root.fingerprint)))throw new Error('PUBLIC_MANIFEST_V3_FINGERPRINT_INVALID');
  const artifacts=descriptors(root.artifacts),surfaces=descriptors(root.surfaces);
  if(artifacts.srm?.state!=='READY')throw new Error('PUBLIC_MANIFEST_V3_SRM_REQUIRED');
  for(const name of ['projectionLedger','activityLedger','shards'])if(artifacts[name]?.state!=='READY')throw new Error(`PUBLIC_MANIFEST_V3_${name.toUpperCase()}_REQUIRED`);
  if(surfaces.graph?.state!=='READY')throw new Error('PUBLIC_MANIFEST_V3_GRAPH_REQUIRED');
  const expected=publicManifestV3Fingerprint({authority:root.authority,sourceVersion:root.sourceVersion,artifacts,surfaces,completeness:root.completeness||{}});
  if(root.fingerprint!==expected)throw new Error('PUBLIC_MANIFEST_V3_FINGERPRINT_MISMATCH');
  return {...root,artifacts,surfaces,completeness:canonicalObject(root.completeness||{})};
}
