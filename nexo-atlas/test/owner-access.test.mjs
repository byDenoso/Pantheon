import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import {ORIGIN} from '../worker/auth.mjs';
import {createWorker} from '../worker/index.mjs';

function environment() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle').filter(v => v.endsWith('.sql')).sort()) sqlite.exec(readFileSync('drizzle/' + name, 'utf8'));
  const DB = {prepare(sql) {const statement = sqlite.prepare(sql);let args = [];return {bind(...v) {args=v;return this;},async first(){return statement.get(...args)||null;},async run(){return statement.run(...args);}};},async batch(statements){sqlite.exec('BEGIN');try{for(const s of statements)await s.run();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}},withSession(){return DB;}};
  return {env:{DB,NEXO_ATLAS_OWNER_EMAIL:'owner@example.invalid'},sqlite};
}
const request = (route, method='GET', id='verified-owner', email='owner@example.invalid', body) => new Request(ORIGIN + route, {method, headers:{origin:ORIGIN,'sec-fetch-site':'same-origin','Content-Type':'application/json','oai-authenticated-user-id':id,'oai-authenticated-user-email':email},...(body?{body:JSON.stringify(body)}:{})});
test('anonymous, wrong-account and same-name visitors cannot bootstrap', async()=>{
  const {env,sqlite}=environment(),worker=createWorker();
  for(const [id,email] of [['',''],['attacker','other@example.invalid']]){
    const access=await (await worker.fetch(request('/api/atlas-access','GET',id,email),env)).json();assert.equal(access.owner,false);
    assert.equal((await worker.fetch(request('/api/atlas-pin/setup','POST',id,email,{pin:'synthetic-only-pin'}),env)).status,401);
  }
  assert.equal(sqlite.prepare('SELECT count(*) n FROM atlas_owner').get().n,0);
});
test('approved verified owner enters PIN; only hash and stable user ID are saved; reset denied',async()=>{
  const {env,sqlite}=environment(),worker=createWorker(),pin='synthetic-only-pin';
  assert.deepEqual(await (await worker.fetch(request('/api/atlas-access'),env)).json(),{signedIn:true,owner:true,setupRequired:true});
  const result=await worker.fetch(request('/api/atlas-pin/setup','POST',undefined,undefined,{pin}),env);assert.equal(result.status,200);
  const owner=sqlite.prepare('SELECT * FROM atlas_owner').get();assert.equal(owner.user_id,'verified-owner');assert.match(owner.pin_hash,/^scrypt\$/);assert.equal(owner.pin_hash.includes(pin),false);
  assert.equal((await worker.fetch(request('/api/atlas-pin/setup','POST',undefined,undefined,{pin}),env)).status,409);
  const imposter=await (await worker.fetch(request('/api/atlas-access','GET','different-subject'),env)).json();assert.equal(imposter.owner,false);
  const anonymous=request('/api/atlas-private','POST','','',{});anonymous.headers.set('cookie',result.headers.get('set-cookie').split(';')[0]);
  assert.equal((await worker.fetch(anonymous,env)).status,401,'PIN cookie alone does not authenticate');
});
test('owner allowlist absent fails closed, even for a platform-signed-in user',async()=>{
  const {env}=environment();delete env.NEXO_ATLAS_OWNER_EMAIL;
  const response=await createWorker().fetch(request('/api/atlas-access'),env);assert.equal((await response.json()).owner,false);
});
