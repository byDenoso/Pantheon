import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {readDriveTower,DRIVE_CONNECTOR} from '../worker/drive-source.mjs';
import {readPrivate} from '../worker/source.mjs';
import {TOWER_ID} from '../server/mcp/operational-state.mjs';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {canonicalDigest,encodePrivateStream} from '../server/atlas/json-stream.mjs';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';

const download='https://sdmntprtest.oaiusercontent.com/files/fixture/raw?synthetic=true';
function connector({race=false,wrongId=false,status,wrongUrl=false}={}){
 const raw=Buffer.from(JSON.stringify(makePrivateTowerFixture()));let revisionCalls=0;const calls=[];
 return {raw,calls,binding:{async invoke(id,action,args){calls.push({id,action,args});assert.equal(id,DRIVE_CONNECTOR);if(status)return {status};
  if(action==='list_file_revisions'){assert.equal(args.fileId,TOWER_ID);const revision=race&&revisionCalls++?'changed':'revision';return {status:'success',result:{structuredContent:{fileId:TOWER_ID,currentRevisionId:revision,revisions:[{id:revision,size:String(raw.length),mimeType:'application/json'}]}}};}
  assert.equal(action,'fetch');assert.equal(args.url,`https://drive.google.com/file/d/${TOWER_ID}/view`);assert.equal(args.download_raw_file,true);assert.equal(args.include_base64,false);
  return {status:'success',result:{structuredContent:{id:wrongId?'other-file':TOWER_ID,mime_type:'application/json',file_size_bytes:raw.length,file_uri:{download_url:wrongUrl?'https://attacker.invalid/raw':download}}}};
 }}};
}
test('Drive source uses only fixed read actions and Tower file, returns complete verified runtime',async()=>{
 const c=connector(),calls=[];const result=await readDriveTower(c.binding,async(url,init)=>{calls.push(String(url));assert.equal(init.redirect,'manual');assert.equal(init.cache,undefined);assert.equal(init.headers['Cache-Control'],'no-store');return new Response(c.raw);});
 assert.equal(result.data.access,'PRIVATE');assert.equal(result.data.transport.kind,'DRIVE_CONNECTOR_COMPLETE_BODY_AND_REVISION_READBACK');
 assert.deepEqual(c.calls.map(v=>v.action),['list_file_revisions','fetch','list_file_revisions']);assert.deepEqual(calls,[download]);
});
test('missing visitor context never falls back to provider credentials',async()=>{
 await assert.rejects(()=>readPrivate({GOOGLE_REFRESH_TOKEN:'synthetic',NEXO_ATLAS_PRIVATE_SOURCE_URL:'https://attacker.invalid',NEXO_ATLAS_PRIVATE_SOURCE_TOKEN:'synthetic'},()=>{throw Error('must not fetch')}),/PRIVATE_SOURCE_NOT_CONFIGURED/);
});
test('revoked consent status is preserved without fallback or download',async()=>{
 const c=connector({status:'reauthentication_required'});
 await assert.rejects(()=>readDriveTower(c.binding,()=>{throw Error('must not fetch')}),error=>error.connectorStatus==='reauthentication_required');
});
test('thrown connector authorization and retry status survive transport sanitization',async t=>{
 t.mock.method(console,'error',()=>{});
 for(const status of ['reauthentication_required','connector_access_disabled','rate_limited']){
  let calls=0;
  const binding={async invoke(){calls++;throw Object.assign(Error('synthetic transport failure'),{connectorStatus:status,retryAfter:17});}};
  await assert.rejects(readDriveTower(binding,()=>{throw Error('must not download');}),error=>error.connectorStatus===status&&error.retryAfter===17);
  assert.equal(calls,1);
 }
});
test('official MCP JSON text content is accepted when structuredContent is absent',async()=>{
 const c=connector(),binding={async invoke(...args){const response=await c.binding.invoke(...args);return {status:response.status,result:{content:[{type:'text',text:JSON.stringify(response.result.structuredContent)}]}};}};
 const result=await readDriveTower(binding,async()=>new Response(c.raw));assert.equal(result.data.access,'PRIVATE');
});
test('changed revision, wrong file, untrusted download URL and size mismatch are rejected',async()=>{
 for(const options of [{race:true},{wrongId:true},{wrongUrl:true}]){const c=connector(options);await assert.rejects(()=>readDriveTower(c.binding,async()=>new Response(c.raw)));}
 const c=connector();await assert.rejects(()=>readDriveTower(c.binding,async()=>new Response('{}')));
});
test('manual download redirect is refused without following its destination',async()=>{
 const c=connector();let calls=0;await assert.rejects(()=>readDriveTower(c.binding,async()=>{calls++;return new Response(null,{status:307,headers:{Location:'https://attacker.invalid'}});}),/DRIVE_DOWNLOAD_HTTP_307/);assert.equal(calls,1);
});
test('optimized compiler is read-only even for deeply frozen Tower input',()=>{
 const tower=makePrivateTowerFixture(),before=JSON.stringify(tower);const freeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);Object.values(v).forEach(freeze);}};freeze(tower);
 assert.equal(compilePrivateTowerRuntime(tower).data.access,'PRIVATE');assert.equal(JSON.stringify(tower),before);
});
test('streamed canonical fingerprints match legacy JSON canonicalization',()=>{
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const value={z:[undefined,null,'á 😀',{'10':'b','2':'a',aaa:'x'}],a:{b:true,c:123,missing:undefined}};
 assert.equal(canonicalDigest(value),'sha256:'+createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'));
});
test('stream compression preserves every byte of complete runtime JSON',async()=>{
 const runtime=compilePrivateTowerRuntime(makePrivateTowerFixture()),encoded=await encodePrivateStream(runtime);
 assert.equal(gunzipSync(encoded.bytes).toString('utf8'),JSON.stringify(runtime));
});
test('workspace profile preserves fixed Drive reads and transport verification while omitting retired views',async()=>{
 const c=connector();const result=await readPrivate({},async()=>new Response(c.raw),{binding:c.binding,profile:'workspace-v1'});
 assert.equal(result.data.contract,'NEXO_ATLAS_PRIVATE_WORKSPACE_V1');assert.equal(result.data.galaxy,null);assert.equal(result.data.world,null);
 assert.equal(result.data.system.workspace_lab.source_revision,result.data.source_revision);assert.equal(result.data.transport.kind,'DRIVE_CONNECTOR_COMPLETE_BODY_AND_REVISION_READBACK');assert.deepEqual(c.calls.map(call=>call.action),['list_file_revisions','fetch','list_file_revisions']);
});
