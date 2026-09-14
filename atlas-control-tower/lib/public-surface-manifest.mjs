import {createHash} from 'node:crypto';

export const PUBLIC_MANIFEST_CONTRACT='NEXO_ATLAS_PUBLIC_MANIFEST_V2';
export const PUBLIC_MANIFEST_ACCESS='PUBLIC_SANITIZED';
const SHA=/^[a-f0-9]{64}$/i;
const FINGERPRINT=/^sha256:[a-f0-9]{64}$/i;
const asObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:null;
const text=value=>typeof value==='string'?value.trim():'';
const hash=value=>createHash('sha256').update(value).digest('hex');

function validateSurface(name,value){
 const surface=asObject(value);
 if(!surface)throw new Error(`SURFACE_DESCRIPTOR_INVALID:${name}`);
 if(surface.state==='READY'){
  if(!text(surface.contract)||!text(surface.path)||!SHA.test(text(surface.sha256))||text(surface.path).includes('..'))throw new Error(`SURFACE_DESCRIPTOR_INVALID:${name}`);
  return {state:'READY',contract:text(surface.contract),path:text(surface.path),sha256:text(surface.sha256).toLowerCase()};
 }
 if(surface.state==='DATA_UNAVAILABLE'){
  if(surface.path!==undefined||surface.sha256!==undefined||surface.contract!==undefined)throw new Error(`SURFACE_DESCRIPTOR_INVALID:${name}`);
  return {state:'DATA_UNAVAILABLE'};
 }
 throw new Error(`SURFACE_DESCRIPTOR_INVALID:${name}`);
}

function canonicalSurfaces(surfaces){
 const root=asObject(surfaces);
 if(!root)throw new Error('PUBLIC_MANIFEST_SURFACES_INVALID');
 return Object.fromEntries(Object.keys(root).sort().map(name=>[name,validateSurface(name,root[name])]));
}

export function surfaceFingerprint({authority='GOOGLE_DRIVE',sourceVersion='',surfaces={}}={}){
 const normalized=canonicalSurfaces(surfaces);
 const lines=Object.entries(normalized).map(([name,surface])=>surface.state==='READY'
  ? `${name}:READY:${surface.contract}:${surface.path}:${surface.sha256}`
  : `${name}:DATA_UNAVAILABLE`);
 return `sha256:${hash([PUBLIC_MANIFEST_CONTRACT,PUBLIC_MANIFEST_ACCESS,String(authority),String(sourceVersion),...lines].join('\n'))}`;
}

export function buildPublicManifest({authority='GOOGLE_DRIVE',sourceVersion='',generatedAt='',sourceModifiedAt='',surfaces={}}={}){
 const normalized=canonicalSurfaces(surfaces);
 if(normalized.graph?.state!=='READY')throw new Error('PUBLIC_MANIFEST_GRAPH_REQUIRED');
 return {
  contract:PUBLIC_MANIFEST_CONTRACT,
  authority:String(authority),
  projectionOnly:true,
  access:PUBLIC_MANIFEST_ACCESS,
  generatedAt:String(generatedAt||''),
  sourceModifiedAt:String(sourceModifiedAt||sourceVersion||''),
  sourceVersion:String(sourceVersion||''),
  fingerprint:surfaceFingerprint({authority,sourceVersion,surfaces:normalized}),
  surfaces:normalized
 };
}

export function validatePublicManifest(value){
 const root=asObject(value);
 if(!root||root.contract!==PUBLIC_MANIFEST_CONTRACT)throw new Error('PUBLIC_MANIFEST_CONTRACT_INVALID');
 if(root.authority!=='GOOGLE_DRIVE'||root.projectionOnly!==true||root.access!==PUBLIC_MANIFEST_ACCESS)throw new Error('PUBLIC_MANIFEST_AUTHORITY_INVALID');
 if(!FINGERPRINT.test(text(root.fingerprint)))throw new Error('PUBLIC_MANIFEST_FINGERPRINT_INVALID');
 const surfaces=canonicalSurfaces(root.surfaces);
 if(surfaces.graph?.state!=='READY')throw new Error('PUBLIC_MANIFEST_GRAPH_REQUIRED');
 const expected=surfaceFingerprint({authority:root.authority,sourceVersion:root.sourceVersion,surfaces});
 if(root.fingerprint!==expected)throw new Error('PUBLIC_MANIFEST_FINGERPRINT_MISMATCH');
 return {...root,surfaces};
}
