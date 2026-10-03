import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {operationalPrincipal} from '../server/mcp/operational-auth.mjs';

const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const kid='unit-writer-oidc';
const jwk={...publicKey.export({format:'jwk'}),kid,alg:'RS256',use:'sig'};
const now=Math.floor(Date.now()/1000);
const base={iss:'https://token.actions.githubusercontent.com',aud:'nexo-inbox',iat:now,exp:now+300,
  repository:'byDenoso/Pantheon',ref:'refs/heads/main',
  workflow_ref:'byDenoso/Pantheon/.github/workflows/nexo-writer-robot.yml@refs/heads/main'};
function token(changes={},key=privateKey){
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid})).toString('base64url');
  const body=Buffer.from(JSON.stringify({...base,...changes})).toString('base64url');
  return `${header}.${body}.${createSign('RSA-SHA256').update(header+'.'+body).sign(key).toString('base64url')}`;
}
const req=value=>new Request('https://nexo-one-two.vercel.app/api/mcp',{method:'POST',headers:{Authorization:'Bearer '+value}});

test('existing Writer OIDC admits only exact signed main identity without a new secret',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    assert.equal(String(url),'https://token.actions.githubusercontent.com/.well-known/jwks');
    return Response.json({keys:[jwk]});
  };
  try{
    const principal=await operationalPrincipal(req(token()),{});
    assert.equal(principal.authenticated,true);assert.deepEqual(principal.roles,['EXECUTOR']);
    assert.equal(principal.id,(await operationalPrincipal(req(token({exp:now+200})),{})).id);
    for(const changes of [{ref:'refs/heads/untrusted'},{repository:'other/fork'},
      {workflow_ref:'byDenoso/Pantheon/.github/workflows/nexo-writer-robot.yml@refs/heads/untrusted'},
      {workflow_ref:'byDenoso/Pantheon/.github/workflows/other.yml@refs/heads/main'},
      {aud:'other'},{exp:now-1},{iat:now+600,exp:now+900}])
      assert.equal(await operationalPrincipal(req(token(changes)),{}),null);
    const wrong=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;
    assert.equal(await operationalPrincipal(req(token({},wrong)),{}),null);
    assert.equal(await operationalPrincipal(req('not-a-credential'),{}),null);
  }finally{globalThis.fetch=original;}
});
