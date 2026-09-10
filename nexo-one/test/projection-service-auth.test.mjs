import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PROJECTION_SERVICE_TRUST,projectionBearer,verifyProjectionServiceToken} from '../server/auth/vercel-oidc.mjs';

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'atlas-test-key',alg:'RS256',use:'sig'};
const now=Date.parse('2026-09-10T09:30:00Z');
const nowSeconds=Math.floor(now/1000);
const issuer=`https://oidc.vercel.com/${PROJECTION_SERVICE_TRUST.ownerSlug}`;
const audience=`https://vercel.com/${PROJECTION_SERVICE_TRUST.ownerSlug}`;
const subject=`owner:${PROJECTION_SERVICE_TRUST.ownerSlug}:project:${PROJECTION_SERVICE_TRUST.projectName}:environment:${PROJECTION_SERVICE_TRUST.environment}`;
const claims=overrides=>({
  iss:issuer,aud:audience,sub:subject,
  owner:PROJECTION_SERVICE_TRUST.ownerSlug,owner_id:PROJECTION_SERVICE_TRUST.ownerId,
  project:PROJECTION_SERVICE_TRUST.projectName,project_id:PROJECTION_SERVICE_TRUST.projectId,
  environment:PROJECTION_SERVICE_TRUST.environment,iat:nowSeconds-30,nbf:nowSeconds-30,exp:nowSeconds+300,
  ...overrides
});
const tokenFor=payload=>{
  const head=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:jwk.kid})).toString('base64url');
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature=sign('RSA-SHA256',Buffer.from(`${head}.${body}`),privateKey).toString('base64url');
  return `${head}.${body}.${signature}`;
};
const fetcher=async url=>{
  assert.equal(url,`${issuer}/.well-known/jwks`);
  return {ok:true,json:async()=>({keys:[jwk]})};
};

test('projection service auth accepts only the exact signed Atlas production identity',async()=>{
  assert.equal(await verifyProjectionServiceToken(tokenFor(claims()),{fetcher,now}),true);
  assert.equal(await verifyProjectionServiceToken(tokenFor(claims({project_id:'prj_wrong'})),{fetcher,now}),false);
  assert.equal(await verifyProjectionServiceToken(tokenFor(claims({environment:'preview'})),{fetcher,now}),false);
  assert.equal(await verifyProjectionServiceToken(tokenFor(claims({exp:nowSeconds-120})),{fetcher,now}),false);
  const valid=tokenFor(claims());
  assert.equal(await verifyProjectionServiceToken(`${valid.slice(0,-2)}aa`,{fetcher,now}),false);
});

test('projection bearer is bounded and explicit',()=>{
  assert.equal(projectionBearer({headers:{authorization:'Bearer abc.def.ghi'}}),'abc.def.ghi');
  assert.equal(projectionBearer({headers:{authorization:'Basic abc'}}),'');
  assert.equal(projectionBearer({headers:{}}),'');
});

test('service identity is wired only inside the projection route while ordinary access remains session based',async()=>{
  const handler=await readFile(new URL('../server/handler.mjs',import.meta.url),'utf8');
  assert.match(handler,/privateAccess=authenticated\(req,env(?:,now)?\),access=privateAccess\?'PRIVATE':'PUBLIC'/);
  assert.match(handler,/if\(route==='projections'\)\{[\s\S]*verifyProjectionService\(req,\{now\}\)[\s\S]*projectionAccess/);
  const afterProjection=handler.split("if(route==='projections')")[1];
  assert.match(afterProjection,/const options=\{now,access,env,force\}/);
});
