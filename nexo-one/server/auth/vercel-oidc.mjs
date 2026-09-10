import {createPublicKey,verify as verifySignature} from 'node:crypto';

export const PROJECTION_SERVICE_TRUST=Object.freeze({
  ownerSlug:'denosooo2-1701s-projects',
  ownerId:'team_TLkDXqQIHke6IumXh3qzMDcs',
  projectName:'nexo-atlas-control-tower',
  projectId:'prj_DLQSz5OiIT1HxWMn2i4AgoIv5x8r',
  environment:'production'
});

const GLOBAL_ISSUER='https://oidc.vercel.com';
const MAX_TOKEN_BYTES=16384;
const CLOCK_SKEW_SECONDS=60;
const MAX_LIFETIME_SECONDS=90*60;

const jsonPart=value=>JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
const audienceHas=(audience,expected)=>audience===expected||(Array.isArray(audience)&&audience.includes(expected));
const textHeader=value=>Array.isArray(value)?value[0]:value;

export function projectionBearer(req){
  const raw=String(textHeader(req?.headers?.authorization)||'');
  if(!raw.startsWith('Bearer '))return '';
  const token=raw.slice(7).trim();
  return token.length&&Buffer.byteLength(token,'utf8')<=MAX_TOKEN_BYTES?token:'';
}

function expected(trust){
  const teamIssuer=`${GLOBAL_ISSUER}/${trust.ownerSlug}`;
  return {
    issuers:new Set([GLOBAL_ISSUER,teamIssuer]),
    audience:`https://vercel.com/${trust.ownerSlug}`,
    subject:`owner:${trust.ownerSlug}:project:${trust.projectName}:environment:${trust.environment}`
  };
}

function validClaims(payload,trust,nowMs){
  const wanted=expected(trust);
  const now=Math.floor(nowMs/1000);
  if(!wanted.issuers.has(payload.iss))return false;
  if(!audienceHas(payload.aud,wanted.audience))return false;
  if(payload.sub!==wanted.subject)return false;
  if(payload.owner!==trust.ownerSlug||payload.owner_id!==trust.ownerId)return false;
  if(payload.project!==trust.projectName||payload.project_id!==trust.projectId)return false;
  if(payload.environment!==trust.environment)return false;
  if(!Number.isFinite(payload.iat)||!Number.isFinite(payload.exp))return false;
  if(payload.iat>now+CLOCK_SKEW_SECONDS)return false;
  if(payload.exp<=now-CLOCK_SKEW_SECONDS)return false;
  if(Number.isFinite(payload.nbf)&&payload.nbf>now+CLOCK_SKEW_SECONDS)return false;
  if(payload.exp-payload.iat<=0||payload.exp-payload.iat>MAX_LIFETIME_SECONDS)return false;
  return true;
}

export async function verifyProjectionServiceToken(token,{fetcher=fetch,now=Date.now(),trust=PROJECTION_SERVICE_TRUST}={}){
  try{
    if(typeof token!=='string'||!token||Buffer.byteLength(token,'utf8')>MAX_TOKEN_BYTES)return false;
    const parts=token.split('.');
    if(parts.length!==3)return false;
    const [encodedHeader,encodedPayload,encodedSignature]=parts;
    const header=jsonPart(encodedHeader),payload=jsonPart(encodedPayload);
    if(header?.alg!=='RS256'||typeof header?.kid!=='string'||!header.kid)return false;
    const wanted=expected(trust);
    if(!wanted.issuers.has(payload?.iss))return false;
    const jwksUrl=`${payload.iss}/.well-known/jwks`;
    const response=await fetcher(jwksUrl,{headers:{Accept:'application/json'}});
    if(!response?.ok)return false;
    const jwks=await response.json();
    const jwk=Array.isArray(jwks?.keys)?jwks.keys.find(key=>key?.kid===header.kid&&(!key.alg||key.alg==='RS256')):null;
    if(!jwk)return false;
    const key=createPublicKey({key:jwk,format:'jwk'});
    const signed=Buffer.from(`${encodedHeader}.${encodedPayload}`);
    const signature=Buffer.from(encodedSignature,'base64url');
    if(!verifySignature('RSA-SHA256',signed,key,signature))return false;
    return validClaims(payload,trust,now);
  }catch{return false;}
}

export async function verifyProjectionService(req,options={}){
  const token=projectionBearer(req);
  return token?verifyProjectionServiceToken(token,options):false;
}
