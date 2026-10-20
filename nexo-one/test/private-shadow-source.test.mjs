import test from 'node:test';
import assert from 'node:assert/strict';
import {projectPrivateShadowBoard, readAtlasPrivateShadow} from '../server/atlas/private-shadow-source.mjs';
import {SHADOW_ID} from '../server/atlas/shadow-board.mjs';

function board() {
  return {contract:'NEXO_SHADOW_BOARD_V1', access:'PRIVATE', source_id:SHADOW_ID,
    modified_at:'2026-10-20T19:00:00Z',
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
