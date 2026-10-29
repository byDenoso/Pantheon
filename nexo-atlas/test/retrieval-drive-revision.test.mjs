import test from 'node:test';
import assert from 'node:assert/strict';
import {readCanonicalDriveRevision,validateImportedDriveRevision,DRIVE_CONNECTOR} from '../worker/drive-source.mjs';
import {TOWER_ID} from '../server/mcp/operational-state.mjs';
const manifest={snapshot:{source_id:TOWER_ID},transport:{revision_id:'synthetic-revision',size:512}};
function binding({id='synthetic-revision',size=512,fileId=TOWER_ID,status='success',mime='application/json'}={}){
 const calls=[];return {calls,async invoke(connector,action,args){calls.push({connector,action,args});assert.equal(connector,DRIVE_CONNECTOR);assert.equal(action,'list_file_revisions');assert.deepEqual(args,{fileId:TOWER_ID,pageSize:1000});
 return {status,result:{structuredContent:{fileId,currentRevisionId:id,revisions:[{id,size:String(size),mimeType:mime}]}}};}};
}
test('revision-only validation reads only the fixed canonical Tower metadata',async()=>{
 const b=binding();assert.deepEqual(await readCanonicalDriveRevision(b),{id:'synthetic-revision',size:512});await validateImportedDriveRevision(b,manifest);assert.equal(b.calls.length,2);
});
test('revision-only boundary rejects changed source, wrong identity, revoked access and bad metadata',async()=>{
 for(const options of [{id:'changed'},{size:513},{fileId:'caller-file'},{status:'reauthentication_required'},{mime:'text/html'}])await assert.rejects(()=>validateImportedDriveRevision(binding(options),manifest));
 await assert.rejects(()=>validateImportedDriveRevision(binding(),{snapshot:{source_id:'caller'},transport:manifest.transport}),/IMPORTED_TRANSPORT_BINDING_MISSING/);
});
