import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {verifyActionsIdentity} from '../worker/autonomy/identity.mjs';

const NOW = 1791662400000;
const T = NOW / 1000;
const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength:2048});
const jwk = {...publicKey.export({format:'jwk'}), kid:'independent-review', alg:'RS256', use:'sig'};
const base = {iss:'https://token.actions.githubusercontent.com', aud:'nexo-atlas-autonomy-writer', repository:'byDenoso/Pantheon', repository_id:'1192094714', repository_owner_id:'271082760', repository_visibility:'public', workflow_ref:'byDenoso/Pantheon/.github/workflows/nexo-writer-robot.yml@refs/heads/main', ref:'refs/heads/main', sub:'repo:byDenoso/Pantheon:ref:refs/heads/main', run_id:'12345',run_attempt:'1',iat:T,nbf:T,exp:T+300};
const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
function token(claims={},header={}) {const raw=b64({alg:'RS256',kid:jwk.kid,...header})+'.'+b64({...base,...claims});return raw+'.'+sign('RSA-SHA256',Buffer.from(raw),privateKey).toString('base64url');}
const req = tok => new Request('https://nexoresearch.org/api/autonomy-writer/decisions',{headers:{authorization:'Bearer '+tok}});
const keyResponse = keys => async(url,init)=>{assert.equal(url,'https://token.actions.githubusercontent.com/.well-known/jwks');assert.equal(init.redirect,'error');assert.ok(init.signal instanceof AbortSignal);return new Response(JSON.stringify({keys}));};
const verify = (claims={},header={},fetcher=keyResponse([jwk])) => verifyActionsIdentity(req(token(claims,header)),{now:NOW,fetcher});

test('independent: exact Request identity accepts; repeated read token remains usable',async()=>{for(let i=0;i<2;i++)assert.deepEqual(await verify(),{run_id:'12345',run_attempt:1,workflow_ref:base.workflow_ref});});
for(const key of ['iss','aud','repository','repository_id','repository_owner_id','repository_visibility','workflow_ref','ref','sub'])for(const value of [undefined,'incorrect',null,[],{}])test('independent: rejects identity '+key+'='+JSON.stringify(value),async()=>assert.equal(await verify({[key]:value}),null));
for(const [name,change] of Object.entries({expired:{exp:T},futureIat:{iat:T+31},futureNbf:{nbf:T+31},oldIat:{iat:T-601},tooLong:{exp:T+601},zeroLifetime:{exp:T},nbfAfterExp:{nbf:T+300},stringIat:{iat:String(T)},stringExp:{exp:String(T+300)},missingNbf:{nbf:undefined},fractionalIat:{iat:T+.1},unsafeExp:{exp:Number.MAX_SAFE_INTEGER+1},retry:{run_attempt:'2'},numericRetry:{run_attempt:2},missingAttempt:{run_attempt:undefined},falseAttempt:{run_attempt:true},numericRun:{run_id:123},zeroRun:{run_id:'0'},negativeRun:{run_id:'-1'},paddedRun:{run_id:'01'},missingRun:{run_id:undefined}}))test('independent: rejects '+name,async()=>assert.equal(await verify(change),null));
for(const header of [{alg:'none'},{alg:'HS256'},{kid:''},{kid:'unknown'},{crit:[]},{jku:'https://attacker.invalid'},{x5u:'https://attacker.invalid'},{kid:'x'.repeat(129)}])test('independent: rejects protected header '+JSON.stringify(header),async()=>assert.equal(await verify({},header),null));
for(const [name,keys] of [['none',[]],['duplicate',[jwk,jwk]],['wrongAlg',[{...jwk,alg:'RS512'}]],['wrongUse',[{...jwk,use:'enc'}]],['wrongType',[{...jwk,kty:'EC'}]],['invalidMaterial',[{...jwk,n:'invalid',e:'invalid'}]]])test('independent: rejects JWKS '+name,async()=>assert.equal(await verify({}, {}, keyResponse(keys)),null));
test('independent: changed signature and malformed compact encodings fail',async()=>{const good=token();const parts=good.split('.');const sig=Buffer.from(parts[2],'base64url');sig[0]^=1;for(const bad of [parts[0]+'.'+parts[1]+'.'+sig.toString('base64url'),good+'.extra',good+'=',good.replace(/\./,'.='),'x'.repeat(20000)])assert.equal(await verifyActionsIdentity(req(bad),{now:NOW,fetcher:keyResponse([jwk])}),null);});
test('independent: JWKS errors, oversized result and bad clocks fail closed',async()=>{for(const fetcher of [async()=>{throw new Error('offline')},async()=>new Response('{}',{status:302}),async()=>new Response('bad'),async()=>new Response('x'.repeat(65537)),async()=>new Response('null')])assert.equal(await verify({}, {}, fetcher),null);for(const now of [NaN,Infinity,-Infinity,'now'])assert.equal(await verifyActionsIdentity(req(token()),{now,fetcher:keyResponse([jwk])}),null);});
test('independent: optional identity overrides do not widen trust',async()=>{assert.equal(await verifyActionsIdentity(req(token({repository:'evil/Pantheon'})),{now:NOW,fetcher:keyResponse([jwk]),repository:'evil/Pantheon'}),null);});
