import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {normalizePrivateTower} from '../server/atlas/private-tower-input.mjs';
import {readVerifiedCanonicalTower,readOperationalTower,TOWER_ID} from '../server/mcp/operational-state.mjs';
import {readAtlasPrivatePublication} from '../server/atlas/private-source.mjs';
import {buildLab} from '../src/features/lab/model.ts';
import {buildAtlasMetroModel} from '../src/atlas3d/atlasAdapter.ts';
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(deepFreeze);}return value;};
function transport(tower,{race=false,badBody=false}={}){
 const raw=JSON.stringify(tower),md5=createHash('md5').update(raw).digest('hex');let metadata=0;
 return async(url,init)=>{assert.match(String(url),/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\//);assert.equal(init.headers.Authorization,'Bearer synthetic');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');if(String(url).includes('alt=media'))return new Response(badBody?raw+' ':raw);metadata++;return Response.json({id:TOWER_ID,headRevisionId:race&&metadata>1?'changed':'synthetic-drive-revision',md5Checksum:md5,size:String(Buffer.byteLength(raw))});};
}
test('one raw canonical Tower compiles every private view with one revision and no mutation',()=>{
 const tower=deepFreeze(makePrivateTowerFixture()),result=compilePrivateTowerRuntime(tower),data=result.data;
 assert.equal(result.contract,'ATLAS_PRIVATE_V1');assert.equal(data.source_revision,tower.revision);
 for(const value of [data.fingerprint,data.system.bus.fingerprint,data.topology.source.projection_fingerprint,data.publication.manifest.projection_fingerprint,data.galaxy.provenance.source_fingerprint])assert.equal(value,tower.revision);
 assert.equal(data.galaxy.tower_revision,tower.revision);assert.equal(data.system.read_model.tests['TEST-01'].private,true);
 assert.ok(data.world.items.some(row=>row.contextId==='OLYMPUS'&&row.title==='Synthetic private task'));
 assert.ok(data.topology.nodes.some(row=>row.kind==='CAPABILITY'));assert.ok(data.galaxy.entities.some(row=>row.domain==='OLYMPUS'));
 assert.equal(data.system.cosmology_state.frontiers[0].id,'FRONTIER-01');
 assert.equal(buildLab(data.system).tests.get('TEST-01').domain,'OLYMPUS');
 assert.ok(buildAtlasMetroModel(data.system,Date.parse(data.generated_at)).nodes.some(row=>row.domain==='OLYMPUS'));
 assert.ok(data.system.inbox.length>0);assert.ok(data.system.filaments.length>0);
});
test('malformed canonical identity/count/control reject instead of compiling a mirror',()=>{
 for(const mutate of [t=>{t.storage='PUBLIC';},t=>{t.stable_file_id='other';},t=>{t.file_count++;},t=>{t.revision='sha256:'+'b'.repeat(64);},t=>{t.files['CONTROL.json'].value.truth_owner='OTHER';}]){const tower=makePrivateTowerFixture();mutate(tower);assert.throws(()=>normalizePrivateTower(tower),/PRIVATE_TOWER_INVALID/);}
});
test('verified reader keeps operational contract while private read gets original canonical body',async()=>{
 const tower=makePrivateTowerFixture();const raw=await readVerifiedCanonicalTower({token:'synthetic',fetchImpl:transport(tower)});assert.deepEqual(raw.tower,tower);assert.equal(raw.proof.body_verified,true);
 const operational=await readOperationalTower({token:'synthetic',fetchImpl:transport(tower)});assert.equal(operational.revision,tower.revision);assert.equal(operational.readback,'PASS');assert.deepEqual(operational.science.tests,[]);
 for(const options of [{race:true},{badBody:true}])await assert.rejects(readVerifiedCanonicalTower({token:'synthetic',fetchImpl:transport(tower,options)}));
});
test('default private source reuses existing read-only Google authorization with no new service',async()=>{
 const tower=makePrivateTowerFixture();let called=0;
 const output=await readAtlasPrivatePublication({},transport(tower),{tokenProvider:async(_env,_signal,options)=>{called++;assert.deepEqual(options.scopes,['https://www.googleapis.com/auth/drive.readonly']);return 'synthetic';}});
 assert.equal(called,1);assert.equal(output.data.source_revision,tower.revision);assert.equal(output.data.system.read_model.tests['TEST-01'].private,true);
});
test('a concurrent Writer revision race retries a read once within one bounded deadline',async()=>{
 const tower=makePrivateTowerFixture();let reads=0,sharedSignal;
 const result=await readAtlasPrivatePublication({},()=>{throw Error('No external fetch');},{tokenProvider:async()=> 'synthetic',reader:async({signal})=>{reads++;if(!sharedSignal)sharedSignal=signal;assert.equal(signal,sharedSignal);if(reads===1)throw Error('TOWER_READ_RACE');return {tower};}});
 assert.equal(reads,2);assert.equal(result.data.source_revision,tower.revision);
});
test('incomplete explicit proxy configuration never falls through to another identity',async()=>{
 let tokens=0;
 await assert.rejects(readAtlasPrivatePublication({NEXO_ATLAS_PRIVATE_SOURCE_TOKEN:'synthetic'},()=>{throw Error('must not fetch');},{tokenProvider:async()=>{tokens++;return 'synthetic';}}),/PRIVATE_SOURCE_NOT_CONFIGURED/);
 assert.equal(tokens,0);
});
