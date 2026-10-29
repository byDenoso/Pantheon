import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mcpAuthorization,MAX_GRANT_MS,GRANT_SCOPE} from '../worker/mcp/grants.mjs';
import {POLICY} from '../worker/retrieval/integrity.mjs';
const pin=`scrypt$${'a'.repeat(32)}$${'b'.repeat(128)}`;
const hash=v=>createHash('sha256').update(v).digest('hex');
const now=1800000000000,subject='synthetic-owner',email='synthetic@example.invalid';
const request=(headers={})=>new Request('https://example.invalid/mcp',{method:'POST',headers:{'oai-authenticated-user-id':subject,'oai-authenticated-user-email':email,...headers}});
function context(changes={},ownerChanges={}) {
 const owner={user_id:subject,pin_hash:pin,...ownerChanges};
 const grant={user_id:subject,grant_id:'synthetic-grant-change-detector',credential_sha256:hash(pin),role:'LEARNER',policy:POLICY,scope:GRANT_SCOPE,created_at:now-1,expires_at:now+MAX_GRANT_MS-1,revoked_at:null,current_pin_hash:pin,...changes};
 const queries=[];
 const DB={withSession(mode){assert.equal(mode,'first-primary');return this;},prepare(sql){queries.push(sql);return {async first(){assert.match(sql,/SELECT user_id, pin_hash FROM atlas_owner/);return owner;},bind(...args){return {async first(){
  if(sql.startsWith('SELECT user_id, pin_hash FROM atlas_owner'))return owner;
  assert.match(sql,/JOIN atlas_owner o ON o.id=1 AND o.user_id=g.user_id/);assert.deepEqual(args,[subject]);return grant;
 }}}};}};
 return {env:{DB,NEXO_ATLAS_OWNER_EMAIL:email},queries};
}
test('MCP grants bind current primary owner/PIN, fixed policy and bounded expiry without cookie',async()=>{
 const {env,queries}=context();const result=await mcpAuthorization(request(),env,now);
 assert.equal(result.subject,subject);assert.equal(result.session_epoch,hash(pin));assert.equal(result.role,'LEARNER');assert.ok(Object.isFrozen(result));assert.equal(queries.length,2);
});
test('MCP rejects missing Sites identity and never accepts a cookie or bearer as identity',async()=>{
 const {env}=context();for(const headers of [{},{cookie:'__Host-atlas_session='+'a'.repeat(64)},{authorization:'Bearer synthetic'}])await assert.rejects(()=>mcpAuthorization(new Request('https://example.invalid/mcp',{headers}),env,now),e=>e.httpStatus===401);
});
test('MCP owner identity cannot be replaced by caller email, service ID or newly pinned owner',async()=>{
 for(const headers of [{'oai-authenticated-user-email':'someone@example.invalid'},{'oai-authenticated-user-id':'service-account'}])await assert.rejects(()=>mcpAuthorization(request(headers),context().env,now),e=>e.httpStatus===403);
 await assert.rejects(()=>mcpAuthorization(request(),context({}, {user_id:'new-owner'}).env,now),e=>e.httpStatus===403);
});
test('MCP rejects every invalid grant field and PIN changes during its primary grant read',async()=>{
 for(const changes of [{grant_id:''},{revoked_at:0},{revoked_at:now},{credential_sha256:'f'.repeat(64)},
  {current_pin_hash:pin.slice(0,-1)+'c'},{current_pin_hash:'invalid-pin'},{role:'ENGINEER'},{policy:'other'},
  {scope:'all-records'},{created_at:now+1},{created_at:now-.5},{expires_at:now},{expires_at:now+MAX_GRANT_MS},
  {created_at:now,expires_at:now},{expires_at:'9999999999999'}])
  await assert.rejects(()=>mcpAuthorization(request(),context(changes).env,now),e=>e.httpStatus===403,JSON.stringify(changes));
});
test('MCP performs fresh authorization on repeated calls rather than caching approval',async()=>{
 const {env,queries}=context();await mcpAuthorization(request(),env,now);await mcpAuthorization(request(),env,now);assert.equal(queries.length,4);
});
