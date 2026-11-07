import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, verify} from 'node:crypto';
import {projectPrivateShadowBoard, readAtlasPrivateShadow} from '../server/atlas/private-shadow-source.mjs';
import {SHADOW_ID} from '../server/atlas/shadow-board.mjs';

function board() {
  return {contract:'NEXO_SHADOW_BOARD_V1', access:'PRIVATE', source_id:SHADOW_ID,
    modified_at:'2026-10-20T19:00:00Z',
    availability:{roadmap:'available',mural:'available',resumo:'available',resultados:'available',equipe:'available'},
    roadmap:[{item:'R1',titulo:'Modelo publicavel',status:'OPEN',unknown:'SECRET'},
             {item:'R5',titulo:'PEER private',status:'OPEN'}],
    mural:[{data:'2026',de:'S1',texto:'Analise independente',id:'x'},
           {data:'2026',texto:'Olympus details',id:'hidden'}],
    resumo:[], resultados:[], equipe:[]};
}

test('only allowlisted fields and neither restricted program are projected', () => {
  const x=projectPrivateShadowBoard(board());
  assert.equal(x.roadmap.length,1);
  assert.equal(x.mural.length,1);
  assert.equal(x.roadmap[0].unknown,undefined);
  assert.equal(x.counts.roadmap,1);
  assert.doesNotMatch(JSON.stringify(x),/peer|olympus/i);
  assert.equal(x.writeback,'FORBIDDEN');
});
test('tab availability is projected as an allowlisted state, never inferred from an empty array',()=>{
  const input=board();
  input.availability={roadmap:'available',mural:'available',resumo:'unavailable',resultados:'available',equipe:'unavailable'};
  const projected=projectPrivateShadowBoard(input);
  assert.deepEqual(projected.availability,input.availability);
  assert.equal(projected.resultados.length,0);
  const older=board();delete older.availability;
  const unknown=projectPrivateShadowBoard(older);
  assert.equal(unknown.availability.resultados,'unknown');
  assert.deepEqual(unknown.roadmap,[]);
  input.availability.resultados='PRIVATE_VALUE';
  assert.equal(projectPrivateShadowBoard(input).availability.resultados,'unknown');
  assert.doesNotMatch(JSON.stringify(projected),/PRIVATE_VALUE/);
});
test('unavailable, malformed, or untrusted snapshot fails closed', () => {
  assert.throws(()=>projectPrivateShadowBoard({...board(),access:'PUBLIC'}));
  assert.throws(()=>projectPrivateShadowBoard({...board(),unavailable:'SHADOW_OFFLINE'}));
  assert.throws(()=>projectPrivateShadowBoard({...board(),mural:42}));
  assert.throws(()=>projectPrivateShadowBoard({...board(),source_id:'other'}));
});
test('rows containing credentials are not projected',()=>{
  const d=board();d.roadmap.push({item:'R9',nota:'access_token = hidden'});
  assert.equal(projectPrivateShadowBoard(d).roadmap.length,1);
});
test('existing read-only Google identity is used, never LIVE',async()=>{
  let tok,options;
  const result=await readAtlasPrivateShadow({},async()=>{},{
    tokenProvider:async(_,signal,opts)=>{tok=opts;return 'synthetic-token';},
    boardReader:async(opts)=>{options=opts;return board();}
  });
  assert.deepEqual(tok.scopes,['https://www.googleapis.com/auth/drive.readonly']);
  assert.equal(options.token,'synthetic-token');
  assert.equal(result.source_id,SHADOW_ID);
});
test('missing credential fails before attempting a source read',async()=>{
  await assert.rejects(readAtlasPrivateShadow({},async()=>{}, {
    tokenProvider:async()=>'',boardReader:async()=>{throw Error('UNEXPECTED');}
  }),/SHADOW_READ_CREDENTIAL_REQUIRED/);
});

test('dedicated read-only identity can populate the private board while Connect returns 429', async () => {
  const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
  const clientEmail = 'shadow-reader@example.iam.gserviceaccount.com';
  const env = {NEXO_ATLAS_SHADOW_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: 'service_account', client_email: clientEmail, private_key_id: 'fixture-key',
    private_key: privateKey.export({type: 'pkcs8', format: 'pem'}),
    token_uri: 'https://must-not-receive-assertion.example/token',
  })};
  const fetcher = async (url, {method, body, redirect}) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(method, 'POST');
    assert.equal(redirect, 'error');
    assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [header, payload, signature] = body.get('assertion').split('.');
    assert.equal(verify('RSA-SHA256', Buffer.from(header + '.' + payload), publicKey, Buffer.from(signature, 'base64url')), true);
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    assert.equal(claims.iss, clientEmail);
    assert.equal(claims.aud, url);
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/drive.readonly');
    assert.equal(claims.sub, undefined);
    return Response.json({access_token: 'reader-token', token_type: 'Bearer', expires_in: 3600});
  };
  const result = await readAtlasPrivateShadow(env, fetcher, {
    tokenProvider: async () => { throw Object.assign(new Error('RATE_LIMITED'), {googleDiagnostic: 'CONNECT_RATE_LIMITED'}); },
    boardReader: async ({token, allowMissingDriveMetadata}) => {
      assert.equal(token, 'reader-token');
      assert.equal(allowMissingDriveMetadata, true);
      return board();
    }
  });
  assert.equal(result.source_id, SHADOW_ID);
  assert.equal(result.mural[0].texto, 'Analise independente');
  assert.equal(result.writeback, 'FORBIDDEN');
});

test('invalid dedicated credentials fail closed without trying Connect', async () => {
  await assert.rejects(readAtlasPrivateShadow({NEXO_ATLAS_SHADOW_SERVICE_ACCOUNT_JSON: '{}'}, async () => {}, {
    tokenProvider: async () => { throw new Error('UNEXPECTED_CONNECT'); }
  }), /SHADOW_SERVICE_ACCOUNT_INVALID/);
});

test('a warm reader reuses a valid OAuth token only for the same key',async()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const config={type:'service_account',client_email:'shadow-reader@example.iam.gserviceaccount.com',
    private_key_id:'key-1',private_key:privateKey.export({type:'pkcs8',format:'pem'})};
  let exchanges=0;
  const fetcher=async()=>Response.json({access_token:'token-'+ ++exchanges,expires_in:3600});
  const run=async key=>readAtlasPrivateShadow({NEXO_ATLAS_SHADOW_SERVICE_ACCOUNT_JSON:JSON.stringify(key)},fetcher,{
    boardReader:async()=>board()
  });
  await run(config);
  await run(config);
  assert.equal(exchanges,1);
  await run({...config,private_key_id:'key-2'});
  assert.equal(exchanges,2);
});

test('a rejected OAuth token is discarded before the next board read',async()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const key={type:'service_account',client_email:'shadow-reader@example.iam.gserviceaccount.com',
    private_key_id:'auth-rejected',private_key:privateKey.export({type:'pkcs8',format:'pem'})};
  const env={NEXO_ATLAS_SHADOW_SERVICE_ACCOUNT_JSON:JSON.stringify(key)};
  let exchanges=0;
  const fetcher=async()=>Response.json({access_token:'token-'+ ++exchanges,expires_in:3600});
  await assert.rejects(readAtlasPrivateShadow(env,fetcher,{boardReader:async()=>{
    throw new Error('SHADOW_AUTH_REQUIRED');
  }}),/SHADOW_AUTH_REQUIRED/);
  await readAtlasPrivateShadow(env,fetcher,{boardReader:async({token})=>{
    assert.equal(token,'token-2');
    return board();
  }});
});
