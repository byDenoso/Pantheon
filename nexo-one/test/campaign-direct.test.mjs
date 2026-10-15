import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EVENT_SCHEMA,eventIdentity,parseEvent,normalizeCampaignObservation,stable,sha256,validateEvent} from '../server/atlas/campaign-records.mjs';
import {readCampaignObservation,campaignScope} from '../server/atlas/campaign-drive.mjs';
import {compilePrivateCampaignRuntime} from '../server/atlas/private-campaign.mjs';
import {validatePrivateRuntime} from '../server/atlas/private-runtime.mjs';
import {readAtlasPrivatePublication} from '../server/atlas/private-source.mjs';

const CAM='CAMP-SYNTHETIC', ROOT='root_synthetic', FOLDER='folder_synthetic', NOW='2026-10-15T02:00:00Z';
const FMIME='application/vnd.google-apps.folder', DMIME='application/vnd.google-apps.document';
const event=(overrides={})=>{const e={schema:EVENT_SCHEMA,campaign_id:CAM,kind:'METHOD',role:'CIENTISTA',entity_id:'TEST-SYNTHETIC',actor_id:'author-synthetic',version:1,access:'PRIVATE',atlas_scope:'PRIVATE',timestamp_utc:NOW,data:{question:'Synthetic integration fixture',method:'known fixture',status:'READY',limitations:['Not scientific evidence']},...overrides};return {...e,event_id:eventIdentity(e)};};
const record=(e,file='file_synthetic')=>({event:e,file_id:file,version:'1',mime_type:'application/json',sha256:sha256(Buffer.from(JSON.stringify(e)))});
const options={campaignId:CAM,folderId:FOLDER,generatedAt:NOW};
const normalize=rows=>normalizeCampaignObservation(rows,options);
const env={NEXO_ATLAS_DATA_SOURCE:'campaigns',NEXO_CAMPAIGNS_ROOT_ID:ROOT,NEXO_ATLAS_CAMPAIGN_FOLDERS:JSON.stringify({[CAM]:FOLDER}),NEXO_ATLAS_DEFAULT_CAMPAIGN:CAM};

function drive(items=[event()],opts={}) {
  const files=new Map();let n=0,listCalls=0,metadataCalls=0;
  for(const item of items){
    const e=item.event??item,raw=Buffer.from(item.raw??JSON.stringify(e)),id=item.fileId??'file_'+(++n);
    const meta={id,name:item.name??`NEXO_EVENT__${e.event_id}.json`,mimeType:item.mimeType??'application/json',parents:[FOLDER],trashed:false,version:'1',size:String(raw.length),modifiedTime:NOW,...(item.noApp?{}:{appProperties:{nexo_event_id:e.event_id}})};
    if(meta.mimeType!==DMIME)meta.md5Checksum=createHash('md5').update(raw).digest('hex');
    files.set(id,{raw,meta});
  }
  const requests=[];
  const fetcher=async(rawUrl,init)=>{
    const u=new URL(rawUrl);requests.push({url:u,init});
    assert.equal(u.origin,'https://www.googleapis.com');assert.equal(init.method,'GET');
    assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.headers.Authorization,'Bearer synthetic');
    if(opts.status)return new Response('{}',{status:opts.status});
    const path=u.pathname.replace('/drive/v3/files','');
    const json=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
    if(path==='/'+ROOT)return json({id:ROOT,name:'Campaigns',mimeType:opts.rootMime??FMIME,parents:[],trashed:false,version:'1'});
    if(path==='/'+FOLDER)return json({id:FOLDER,name:opts.folderName??CAM,mimeType:FMIME,parents:[opts.parent??ROOT],trashed:false,version:'1'});
    if(path===''){
      listCalls++;
      if(opts.incomplete)return json({files:[],incompleteSearch:true});
      if(opts.loop)return json({files:[],nextPageToken:'loop'});
      const rows=[...files.values()].map(f=>structuredClone(f.meta));
      if(opts.listRace&&listCalls>1)rows.push({id:'late',name:'new',mimeType:'text/plain',parents:[FOLDER],trashed:false,version:'1'});
      if(opts.paginate&&rows.length>1){const p=Number(u.searchParams.get('pageToken')||0);return json({files:rows.slice(p,p+1),...(p+1<rows.length?{nextPageToken:String(p+1)}:{})});}
      if(opts.duplicate&&rows.length)rows.push(rows[0]);
      return json({files:rows,incompleteSearch:false});
    }
    const id=path.split('/')[1],file=files.get(id);
    if(!file)return new Response('{}',{status:404});
    if(u.searchParams.get('alt')==='media'||path.endsWith('/export'))return new Response(opts.corrupt?Buffer.from('corrupt'):file.raw);
    metadataCalls++;const meta=structuredClone(file.meta);
    if(opts.fileRace)meta.version='2';
    if(opts.metadataId)meta.id=opts.metadataId;
    return json(meta);
  };
  return {files,requests,fetcher,get listCalls(){return listCalls;},get metadataCalls(){return metadataCalls;}};
}
const read=(d,overrides={})=>readCampaignObservation({token:'synthetic',rootId:ROOT,folderId:FOLDER,campaignId:CAM,fetchImpl:d.fetcher,now:()=>NOW,...overrides});

test('event identity has a frozen interoperable recipe',()=>{
  const e=event();assert.equal(e.event_id,'EV-'+sha256(`${CAM}\nCIENTISTA\nMETHOD\nTEST-SYNTHETIC\n1`));
  assert.deepEqual(parseEvent(Buffer.from(JSON.stringify(e))),e);
});
test('native Doc BOM and CRLF preserve parsed content',()=>{const e=event();assert.deepEqual(parseEvent(Buffer.from('\uFEFF'+JSON.stringify(e,null,2).replace(/\n/g,'\r\n'))),e);});
for(const [name,raw] of [['top level','{"schema":"a","schema":"b"}'],['nested','{"data":{"a":1,"a":2}}'],['escaped','{"a":1,"\\u0061":2}']])test('reject duplicate keys: '+name,()=>assert.throws(()=>parseEvent(Buffer.from(raw)),/DUPLICATE_JSON_KEY/));
for(const [name,mutate,code] of [
 ['role',e=>e.role='EDITOR','EVENT_ROLE_KIND_MISMATCH'],['access',e=>e.access='PUBLIC','EVENT_ACCESS_INVALID'],
 ['identity',e=>e.event_id='bad','EVENT_IDENTITY_MISMATCH'],['version',e=>e.version=0,'EVENT_VERSION_INVALID'],
 ['campaign',e=>e.campaign_id='other','CAMPAIGN_ID_MISMATCH'],['number',e=>e.data.bad=Infinity,'UNSAFE_JSON_NUMBER'],
 ['safe integer',e=>e.data.bad=Number.MAX_SAFE_INTEGER+1,'UNSAFE_JSON_NUMBER'],['timestamp',e=>e.timestamp_utc='bad','EVENT_TIMESTAMP_INVALID']
])test('reject invalid '+name,()=>{const e=event();mutate(e);assert.throws(()=>validateEvent(e,CAM),new RegExp(code));});
test('prototype-bearing JSON is rejected',()=>{const e=event();assert.throws(()=>parseEvent(Buffer.from(JSON.stringify(e).replace('"data":{','"data":{"__proto__":{},'))),/EVENT_KEY_INVALID/);});
test('equivalent transport copies are one event with both provenance records',()=>{const e=event(),o=normalize([record(e,'a'),record(e,'b')]);assert.equal(o.events.length,1);assert.equal(o.events[0].sources.length,2);});
test('conflicting copies are not silently last-write-wins',()=>{const a=event(),b=event({data:{question:'changed'}});assert.throws(()=>normalize([record(a,'a'),record(b,'b')]),/EVENT_CONTENT_CONFLICT/);});
test('source fingerprint is independent of input ordering',()=>{const a=record(event(),'a'),b=record(event({entity_id:'TEST-B'}),'b');assert.equal(normalize([a,b]).revision,normalize([b,a]).revision);});
test('private/excluded and PEER derivatives are absent from every view',()=>{
 const secret=event({entity_id:'TEST-PEER-EXCLUDED',data:{question:'private evidence'}});
 const derived=event({kind:'SYNTHESIS',role:'EDITOR',entity_id:'STUDY-X',data:{source_event_ids:[secret.event_id],summary:'must not escape'}});
 const o=normalize([record(secret,'secret'),record(derived,'derived'),record(event(),'visible')]);
 const runtime=compilePrivateCampaignRuntime(o),text=JSON.stringify(runtime);
 assert.equal(o.events.length,1);for(const x of ['TEST-PEER-EXCLUDED','must not escape','secret',derived.event_id])assert.equal(text.includes(x),false);
});
test('EXCLUDED is default-denied independently of content',()=>assert.equal(normalize([record(event({atlas_scope:'EXCLUDED'}))]).events.length,0));
test('scope is server configured and cannot use an arbitrary folder URL',()=>{assert.deepEqual(campaignScope(env),{campaignId:CAM,folderId:FOLDER,rootId:ROOT});assert.throws(()=>campaignScope(env,'https://attacker.invalid'),/SCOPE_NOT_CONFIGURED/);assert.throws(()=>campaignScope({...env,NEXO_ATLAS_CAMPAIGN_FOLDERS:'[]'}),/CONFIG_INVALID/);});
test('read completes bounded two-pass inventory with raw integrity verification',async()=>{const d=drive(),o=await read(d);assert.equal(o.events.length,1);assert.equal(d.listCalls,2);assert.equal(o.coverage.consistency,'OBSERVED_FILE_REVISIONS_NOT_ATOMIC');});
test('pagination is fully consumed before success',async()=>{const d=drive([event(),event({entity_id:'TEST-B'})],{paginate:true});assert.equal((await read(d)).events.length,2);assert.equal(d.listCalls,4);});
test('native Docs are real parsed text, not falsely called JSON bytes',async()=>{const e=event(),d=drive([{event:e,mimeType:DMIME,raw:'\uFEFF'+JSON.stringify(e,null,2).replace(/\n/g,'\r\n')}]);const o=await read(d);assert.equal(o.sources[0].mime_type,DMIME);assert.deepEqual(o.events[0].event,e);});
test('unknown historical artifacts stay unparsed, not invented as results',async()=>{const d=drive([{event:{},name:'legacy.zip',mimeType:'application/zip',raw:'archive',noApp:true}]);const o=await read(d);assert.equal(o.events.length,0);assert.equal(o.coverage.unparsed_artifacts,1);assert.equal(o.coverage.scientific_coverage,'NOT_INFERRED');});
for(const [name,opts,code] of [
 ['root type',{rootMime:'text/plain'},'ROOT_INVALID'],['campaign folder',{folderName:'other'},'FOLDER_MISMATCH'],
 ['parent',{parent:'other'},'FOLDER_MISMATCH'],['incomplete listing',{incomplete:true},'LIST_INCOMPLETE'],
 ['repeated page',{loop:true},'PAGE_LOOP'],['duplicate files',{duplicate:true},'LIST_DUPLICATE'],
 ['file read race',{fileRace:true},'EVENT_READ_RACE'],['campaign read race',{listRace:true},'CAMPAIGN_READ_RACE'],
 ['corrupt bytes',{corrupt:true},'EVENT_BYTES_MISMATCH'],['metadata identity',{metadataId:'other'},'IDENTITY_INVALID']
])test('fail closed: '+name,async()=>assert.rejects(read(drive([event()],opts)),new RegExp(code)));
for(const status of [401,403])test('authorization '+status+' never retries',async()=>{const d=drive([event()],{status});await assert.rejects(read(d),new RegExp('AUTH_'+status));assert.equal(d.requests.length,1);});
test('hard byte budget is enforced',async()=>assert.rejects(read(drive(),{maxBytes:10}),/READ_LIMIT/));
test('hard file budget is enforced',async()=>assert.rejects(read(drive([event(),event({entity_id:'TEST-B'})]),{maxFiles:1}),/LIST_LIMIT/));
test('five-view adapter validates against the unchanged existing validator',async()=>{const value=compilePrivateCampaignRuntime(await read(drive()));assert.deepEqual(validatePrivateRuntime(value.data),value.data);assert.equal(value.data.publication.manifest.authority,'CAMPAIGN_FILES');});
test('original method and result stay distinct and no review is inferred',()=>{
 const m=event(),r=event({kind:'RESULT',role:'EXECUTOR',entity_id:'RESULT-X',data:{test_id:m.entity_id,method_event_id:m.event_id,status:'EXECUTED',estimate:1.25,limitations:['synthetic']}});
 const c=event({kind:'REVIEW',role:'CRITICO',actor_id:'critic-synthetic',entity_id:'REVIEW-X',data:{test_id:m.entity_id,result_event_id:r.event_id,verdict:'NEEDS_WORK'}});
 const out=compilePrivateCampaignRuntime(normalize([record(m,'m'),record(r,'r'),record(c,'c')]));
 assert.equal(out.data.system.read_model.tests[m.entity_id].status,'READY');
 assert.equal(out.data.system.read_model.artifacts[r.event_id].data.estimate,1.25);
 assert.equal(out.data.system.read_model.tests[m.entity_id].review_refs[0],c.event_id);
 assert.ok(out.data.system.graph.nodes.every(n=>!n.review_state));
 assert.equal(out.data.system.cosmology_state,null);
 assert.equal(out.data.system.availability.coverage.scope,'SELECTED_CAMPAIGN_ONLY');
});
test('older source versions remain inspectable without replacing the latest method',()=>{
 const a=event(),b=event({version:2,data:{question:'new version',status:'READY'}});
 const value=compilePrivateCampaignRuntime(normalize([record(a,'a'),record(b,'b')]));
 assert.equal(value.data.system.read_model.tests[a.entity_id].question,'new version');
 assert.equal(Object.keys(value.data.system.read_model.artifacts).length,2);
});
test('production source entrypoint reaches campaign adapter without Tower dependencies',async()=>{
 const d=drive();let calls=0;
 const value=await readAtlasPrivatePublication(env,d.fetcher,{tokenProvider:async(_e,_s,opts)=>{calls++;assert.deepEqual(opts.scopes,['https://www.googleapis.com/auth/drive.readonly']);return 'synthetic';},reader:()=>{throw new Error('Tower must not run');},now:()=>NOW});
 assert.equal(value.contract,'ATLAS_PRIVATE_V1');assert.equal(calls,1);assert.equal(value.data.system.scenario_id,'private-campaign');
});
test('campaign failure cannot fall back to a Tower, proxy or stale snapshot',async()=>{
 let tower=0;const d=drive([event()],{status:403});
 await assert.rejects(readAtlasPrivatePublication({...env,NEXO_ATLAS_PRIVATE_SOURCE_URL:'https://proxy.invalid',NEXO_ATLAS_PRIVATE_SOURCE_TOKEN:'synthetic'},d.fetcher,{tokenProvider:async()=> 'synthetic',reader:()=>{tower++;}}),/AUTH_403/);
 assert.equal(tower,0);assert.equal(d.requests.length,1);
});
for(const status of [401,403])test('legacy proxy auth '+status+' cannot fall back to Drive',async()=>{
 let token=0,reader=0;
 await assert.rejects(readAtlasPrivatePublication({NEXO_ATLAS_PRIVATE_SOURCE_URL:'https://proxy.invalid',NEXO_ATLAS_PRIVATE_SOURCE_TOKEN:'synthetic'},async()=>new Response('{}',{status}),{tokenProvider:()=>{token++;},reader:()=>{reader++;}}),error=>error?.code==='PRIVATE_SOURCE_ACCESS_DENIED'&&error?.message==='PRIVATE_SOURCE_UNAVAILABLE');
 assert.equal(token,0);assert.equal(reader,0);
});
test('unknown mode rejected before source access',async()=>{await assert.rejects(readAtlasPrivatePublication({NEXO_ATLAS_DATA_SOURCE:'other'},()=>{throw Error('unexpected');}),/MODE_INVALID/);});
test('a tampered view generation fails the existing runtime validator',()=>{const out=compilePrivateCampaignRuntime(normalize([record(event())])).data;out.world.access='PUBLIC';assert.throws(()=>validatePrivateRuntime(out),/PRIVATE_RUNTIME_INVALID/);});
test('equivalent copy ordering does not change per-field provenance',()=>{
 const a=record(event(),'a'),b=record(event(),'b');
 assert.deepEqual(compilePrivateCampaignRuntime(normalize([a,b])),compilePrivateCampaignRuntime(normalize([b,a])));
});
test('opaque excluded entity and file references stay excluded transitively',()=>{
 const a=event({entity_id:'OPAQUE-X',atlas_scope:'EXCLUDED'});
 const b=event({kind:'RESULT',role:'EXECUTOR',entity_id:'NUM-X',data:{test_id:'OPAQUE-X',summary:'forbidden'}});
 const c=event({kind:'REVIEW',role:'CRITICO',entity_id:'REV-X',data:{source:'gdrive-file://secret_file@1'}});
 assert.equal(normalize([record(a,'secret_file'),record(b,'b'),record(c,'c')]).events.length,0);
});
test('non-JSON data cannot be silently stripped',()=>{for(const value of [undefined,()=>0,1n])assert.throws(()=>validateEvent(event({data:{value}})),/NON_JSON_VALUE/);});
test('invalid calendar dates do not normalize silently',()=>assert.throws(()=>validateEvent(event({timestamp_utc:'2026-02-30T00:00:00Z'})),/TIMESTAMP_INVALID/));
test('event filename and content must match',async()=>{
 const d=drive([{event:event(),name:'NEXO_EVENT__EV-'+('b'.repeat(64))+'.json',noApp:true}]);
 await assert.rejects(read(d),/EVENT_FILENAME_MISMATCH/);
});
test('RUN success requires explicit readback and is not scientific approval',()=>{
 const r=event({kind:'RUN',role:'EXECUTOR',entity_id:'RUN-X',data:{status:'SUCCEEDED',readback:{status:'CONFIRMED'}}});
 const out=compilePrivateCampaignRuntime(normalize([record(r)]));
 assert.equal(out.data.system.runs[0].status,'SUCCEEDED');assert.equal(out.data.system.graph.nodes[1].review_state,null);
 const q=event({kind:'RUN',role:'EXECUTOR',entity_id:'RUN-X',data:{status:'SUCCEEDED'}});
 assert.equal(compilePrivateCampaignRuntime(normalize([record(q)])).data.system.runs[0].status,'UNKNOWN');
});
test('explicit historical no-Atlas restriction cannot be overridden by event visibility',()=>{
 const e=event({data:{privacy:'PRIVATE_NEXO_ONLY_NO_ATLAS_EXPORT'}});assert.equal(normalize([record(e)]).events.length,0);
});
test('cleanup failure cannot turn a proxy denial into fallback authorization',async()=>{
 let reads=0;
 const fetcher=async()=>({ok:false,status:403,body:{cancel:async()=>{throw Error('cleanup failed');}}});
 await assert.rejects(readAtlasPrivatePublication({NEXO_ATLAS_PRIVATE_SOURCE_URL:'https://proxy.invalid',NEXO_ATLAS_PRIVATE_SOURCE_TOKEN:'synthetic'},fetcher,{tokenProvider:()=>{reads++;}}),error=>error?.code==='PRIVATE_SOURCE_ACCESS_DENIED'&&error?.message==='PRIVATE_SOURCE_UNAVAILABLE');
 assert.equal(reads,0);
});

test('an excluded campaign cannot leak its identity through an empty Atlas header',()=>{
  const campaignId='CAMP-PEER-PRIVATE';
  assert.throws(()=>campaignScope({NEXO_ATLAS_CAMPAIGN_FOLDERS:JSON.stringify({[campaignId]:'private_folder'}),NEXO_ATLAS_DEFAULT_CAMPAIGN:campaignId,NEXO_CAMPAIGNS_ROOT_ID:'root'}),/CAMPAIGN_EXCLUDED/);
  assert.throws(()=>normalizeCampaignObservation([],{campaignId,folderId:'private_folder',generatedAt:'2026-10-15T02:00:00Z'}),/CAMPAIGN_EXCLUDED/);
});
