import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, createSign} from 'node:crypto';
import {attestHuman, verifyHuman, humanProposal, sha256, scientificPackage, verifyActionsIdentity,
  WRITER_WORKFLOW, RUNNER_WORKFLOW} from '../server/autonomy/authority.mjs';
import {createAutonomyRoutes} from '../server/autonomy/routes.mjs';

const env={NEXO_SESSION_SECRET:'synthetic-test-secret-'.repeat(3)};
const envelope={kind:'OPERATOR_INTENT',source:'DENER',payload:{action:'APPROVE_AUTONOMY_MANDATE',mandate_id:'m-one',public_data_only:true}};
test('human authority requires server attestation bound to the exact intent',()=>{
  const proof=attestHuman(envelope,env);
  assert.equal(verifyHuman(envelope,proof,env),true);
  assert.equal(verifyHuman({...envelope,payload:{...envelope.payload,mandate_id:'m-other'}},proof,env),false);
  assert.equal(verifyHuman(envelope,{...proof,signature:'0'.repeat(64)},env),false);
  assert.equal(verifyHuman(envelope,proof,{NEXO_SESSION_SECRET:'other-secret-'.repeat(4)}),false);
  assert.throws(()=>humanProposal({...envelope,source:'EXECUTOR'}));
  assert.throws(()=>humanProposal({...envelope,payload:{...envelope.payload,cost:0.1}}));
});
test('human control refuses machine session, CSRF and an unconfirmed proposal',async()=>{
  let submits=0;
  const make=opts=>createAutonomyRoutes({...opts,submit:async()=>{submits++;return{stage:'DELIVERED',readback:'PASS'};}});
  const req={method:'POST',headers:{},body:{envelope,confirmation_sha256:sha256(envelope)}};
  assert.equal((await make({humanAuthenticated:()=>false})('autonomy-control',req,env)).status,401);
  assert.equal((await make({humanAuthenticated:async()=>false})('autonomy-control',req,env)).status,401);
  assert.equal((await make({humanAuthenticated:()=>true,originAllowed:()=>false})('autonomy-control',req,env)).status,403);
  const handler=make({humanAuthenticated:()=>true,originAllowed:()=>true});
  assert.equal((await handler('autonomy-control',{...req,body:{envelope,confirmation_sha256:'0'.repeat(64)}},env)).status,409);
  assert.equal(submits,0);
  assert.equal((await handler('autonomy-control',req,env)).status,202);
  assert.equal(submits,1);
});
test('runner identity is signature verified and bound to exact public main workflow',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const key={...publicKey.export({format:'jwk'}),kid:'test-key'};
  const now=Date.now();
  const claims={iss:'https://token.actions.githubusercontent.com',aud:'nexo-autonomy-runner',
    repository:'byDenoso/Pantheon',repository_visibility:'public',workflow_ref:RUNNER_WORKFLOW,
    ref:'refs/heads/main',sub:'repo:byDenoso/Pantheon:ref:refs/heads/main',iat:now/1000-30,exp:now/1000+300,run_id:'123',run_attempt:'1'};
  const request=c=>{
    const h=Buffer.from(JSON.stringify({alg:'RS256',kid:key.kid})).toString('base64url');
    const p=Buffer.from(JSON.stringify(c)).toString('base64url');
    return{headers:{authorization:'Bearer '+h+'.'+p+'.'+createSign('RSA-SHA256').update(h+'.'+p).sign(privateKey,'base64url')}};
  };
  const opts={workflow:RUNNER_WORKFLOW,audience:'nexo-autonomy-runner',now,
    fetcher:async()=>new Response(JSON.stringify({keys:[key]}))};
  assert.equal((await verifyActionsIdentity(request(claims),opts)).run_id,'123');
  for(const changed of [{workflow_ref:WRITER_WORKFLOW},{ref:'refs/pull/1/merge'},{repository_visibility:'private'},
    {aud:'nexo-inbox'},{exp:now/1000-1},{sub:'repo:byDenoso/Pantheon:pull_request'}])
    assert.equal(await verifyActionsIdentity(request({...claims,...changed}),opts),null);
  assert.equal(await verifyActionsIdentity({headers:{authorization:'Bearer invalid.jwt.token'}},opts),null);
});
function towerFixture(){
  const tests=[{test_id:'T-one',attempt_id:'attempt-one',execution_fingerprint:'sha256:'+'a'.repeat(64),
    recipe:'linear_cv',recipe_sha256:'b'.repeat(64),recipe_revision:'c'.repeat(40),params:{z:0.00001},timeout_min:30,
    inputs:[{kind:'generated',generator:'public-synthetic-v1',seed:42,public:true,sha256:'e'.repeat(64)}]}];
  const frozen={schema:'NEXO_SCIENTIFIC_PACKAGE_V1',battery_id:'bat-one',mandate_id:'m-one',mandate_revision:1,
    source_revision:'sha256:'+'d'.repeat(64),parallelism:1,tests};
  const package_json=JSON.stringify(frozen).replace('0.00001','1e-05');
  return{files:{'CONTROL.json':{value:{autonomy_mandate:{schema:'NEXO_AUTONOMY_MANDATE_V1',id:'m-one',revision:1,status:'ACTIVE',
    domain:'OBSERVATIONAL_COSMOLOGY',public_data_only:true,no_additional_cost:true,runner:'GITHUB_ACTIONS_STANDARD_PUBLIC'}}},
    'entities/test/T-one.json':{value:{kind:'TEST',id:'T-one',mandate_id:'m-one',visibility:'PUBLIC',public_data_only:true,
      battery_id:'bat-one',attempt_id:tests[0].attempt_id,recipe:tests[0].recipe,recipe_params:{...tests[0].params},
      execution_recipe_sha256:tests[0].recipe_sha256,data_binding:{inputs:tests[0].inputs}}},
    'evolution/batteries.json':{value:{batteries:[{id:'bat-one',status:'RUNNING',...frozen,
      transport:'CANONICAL_DRIVE_PACKAGE',run_ref:'actions/runs/123',package_json,package_sha256:sha256(package_json)}]}}}};
}
test('frozen package preserves scientific bytes and refuses revocation/replay/wrong run',()=>{
  const tower=towerFixture();const identity={run_id:'123',run_attempt:1};
  assert.match(scientificPackage(tower,'bat-one',identity).package_json,/1e-05/);
  assert.throws(()=>scientificPackage(tower,'bat-one',{...identity,run_id:'999'}),/BINDING_PENDING/);
  assert.throws(()=>scientificPackage(tower,'bat-one',{...identity,run_attempt:2}),/REPLAY_REFUSED/);
  tower.files['entities/test/T-one.json'].value.visibility='PRIVATE';
  assert.throws(()=>scientificPackage(tower,'bat-one',identity),/PUBLIC_PROVENANCE_REQUIRED/);
  tower.files['entities/test/T-one.json'].value.visibility='PUBLIC';
  const battery=tower.files['evolution/batteries.json'].value.batteries[0];
  battery.tests[0].params.z=0.2;
  assert.throws(()=>scientificPackage(tower,'bat-one',identity),/PROVENANCE_REQUIRED|HASH_MISMATCH/);
  tower.files['CONTROL.json'].value.autonomy_mandate.status='REVOKED';
  assert.throws(()=>scientificPackage(tower,'bat-one',identity),/NOT_ACTIVE/);
});
