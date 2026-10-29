import {cosmologyPublicProjection} from '../worker/public-cosmology.mjs';
import {visualPublicProjection} from '../worker/public-visuals.mjs';
import {publicEditorialProjection} from '../worker/public-editorial.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {scryptSync} from 'node:crypto';
import {gunzipSync, gzipSync} from 'node:zlib';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {configured, ORIGIN, readSession, sameOrigin, sessionRoute} from '../worker/auth.mjs';
import {createWorker} from '../worker/index.mjs';
import {readPrivate, sourceConfigured} from '../worker/source.mjs';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
import {makePrivateRuntimeFixture} from './helpers/private-runtime.fixture.mjs';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';

const PIN = 'synthetic-test-only-passcode';
const salt = 'a'.repeat(32);
const pinHash = `scrypt$${salt}$${scryptSync(PIN, salt, 64).toString('hex')}`;
function d1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
  const db = {
    prepare(sql) { const statement = sqlite.prepare(sql); let args = []; const result = {
      bind(...values) {args = values; return result;},
      async first() {return statement.get(...args) ?? null;},
      async run() {return {success: true, meta: statement.run(...args)};},
    }; return result; },
    async batch(statements) {sqlite.exec('BEGIN'); try {const out = []; for (const statement of statements) out.push(await statement.run()); sqlite.exec('COMMIT'); return out;} catch (e) {sqlite.exec('ROLLBACK'); throw e;}},
    withSession(mode) {assert.equal(mode, 'first-primary'); return db;},
    sqlite,
  }; return db;
}
const envFor = () => {const DB = d1(); DB.sqlite.prepare('INSERT INTO atlas_owner VALUES (1, ?, ?)').run('owner-test', pinHash); return {DB, NEXO_ATLAS_PIN_HASH: pinHash, NEXO_ATLAS_OWNER_EMAIL: 'owner@example.invalid', ASSETS: {fetch: async () => new Response('<html>PUBLIC_ONLY</html>', {headers: {'Content-Type': 'text/html'}})}};};
function req(route, {method = 'GET', cookie, origin = ORIGIN, ...options} = {}) {
  const {headers, ...rest} = options;
  return new Request(ORIGIN + route, {method, ...rest, headers: {origin, 'sec-fetch-site': 'same-origin', 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'owner-test', 'oai-authenticated-user-email': 'owner@example.invalid', ...(cookie ? {cookie} : {}), ...headers}});
}
const cookieOf = decision => decision.setCookie.split(';')[0];
const login = (env, now = Date.now(), cookie) => sessionRoute(req('/api/atlas-session', {method: 'POST', cookie}), env, {pin: PIN}, now);

test('autonomy read requires owner, PIN and exact origin; returns no private records or writes',async()=>{
 const env=envFor(),cookie=cookieOf(await login(env));let reads=0;
 const tower=makePrivateTowerFixture();tower.files['CONTROL.json'].value.mode='ACTIVE';
 const worker=createWorker({readMemory:async()=>{reads++;return tower;}});
 const call=opts=>worker.fetch(req('/api/atlas-private/autonomy',{method:'POST',body:'{}',...opts}),env,{});
 for(const opts of [{},{cookie,headers:{'oai-authenticated-user-id':'other'}},{cookie,headers:{'oai-authenticated-user-id':'','oai-authenticated-user-email':''}}])assert.equal((await call(opts)).status,401);
 assert.equal((await call({cookie,origin:'https://attacker.invalid'})).status,403);assert.equal(reads,0);
 assert.equal((await call({cookie,method:'GET',body:undefined})).status,405);
 assert.equal((await call({cookie,body:'{"action":"APPROVE_AUTONOMY_MANDATE"}'})).status,400);
 assert.equal((await call({cookie,headers:{'Content-Type':'text/plain'}})).status,415);assert.equal(reads,0);
 const before=env.DB.sqlite.prepare('SELECT total_changes() n').get().n;
 const response=await call({cookie}),raw=await response.text();assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/private, no-store/);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);assert.equal(JSON.parse(raw).status,'PREPARED_INACTIVE');assert.doesNotMatch(raw,/Synthetic private|OLYMPUS|pin_hash/);
 assert.equal(reads,1);assert.equal(env.DB.sqlite.prepare('SELECT total_changes() n').get().n,before);
});
test('autonomy rechecks owner, session revocation, expiry and PIN rotation after read',async()=>{
 for(const sql of ['DELETE FROM atlas_sessions', 'UPDATE atlas_sessions SET expires_at=1', "UPDATE atlas_owner SET user_id='different-owner'", "UPDATE atlas_owner SET pin_hash='invalid'"]){
  const env=envFor(),cookie=cookieOf(await login(env));const worker=createWorker({readMemory:async()=>{env.DB.sqlite.exec(sql);return makePrivateTowerFixture();}});
  const result=await worker.fetch(req('/api/atlas-private/autonomy',{method:'POST',body:'{}',cookie}),env,{});assert.equal(result.status,401);assert.deepEqual(await result.json(),{error:'AUTH_REQUIRED'});
 }
});
test('autonomy source failures remain unavailable; source lock prevents concurrent reads',async()=>{
 const env=envFor(),cookie=cookieOf(await login(env));const call=worker=>worker.fetch(req('/api/atlas-private/autonomy',{method:'POST',body:'{}',cookie}),env,{});
 for(const readMemory of [async()=>{throw new Error('SECRET_DIAGNOSTIC');},async()=>({...makePrivateTowerFixture(),stable_file_id:'OTHER'})]){const response=await call(createWorker({readMemory}));assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'PRIVATE_SOURCE_UNAVAILABLE'});}
 let unblock,reads=0;const worker=createWorker({readMemory:()=>{reads++;return new Promise(resolve=>{unblock=resolve;});}});const pending=call(worker);
 while(!unblock)await new Promise(resolve=>setImmediate(resolve));
 assert.equal((await call(worker)).status,503);assert.equal(reads,1);unblock(makePrivateTowerFixture());assert.equal((await pending).status,200);
});

test('continuity route enforces owner, PIN, same origin and revocation after full source read',async()=>{
 const env=envFor(),loginResult=await login(env),cookie=cookieOf(loginResult);let reads=0;
 const worker=createWorker({readContinuity:async()=>{reads++;return makePrivateTowerFixture();}});
 const call=opts=>worker.fetch(req('/api/atlas-private/continuity',{method:'POST',body:'{}',...opts}),env,{});
 assert.equal((await call({})).status,401);assert.equal((await call({cookie,origin:'https://attacker.invalid'})).status,403);assert.equal(reads,0);
 const result=await call({cookie});assert.equal(result.status,200);assert.equal((await result.json()).access,'OWNER_PRIVATE');assert.match(result.headers.get('Cache-Control'),/no-store/);
 const revoked=createWorker({readContinuity:async()=>{env.DB.sqlite.prepare('DELETE FROM atlas_sessions').run();return makePrivateTowerFixture();}});
 const last=await revoked.fetch(req('/api/atlas-private/continuity',{method:'POST',body:'{}',cookie}),env,{});assert.equal(last.status,401);assert.deepEqual(await last.json(),{error:'AUTH_REQUIRED'});
});

test('unconfigured authentication is closed and public status contains no secrets', async () => {
  assert.equal(configured({}), false);
  const r = await sessionRoute(req('/api/atlas-session'), {});
  assert.deepEqual(r.body, {configured: false, authenticated: false});
  assert.equal((await sessionRoute(req('/api/atlas-session', {method: 'POST'}), {}, {pin: PIN})).status, 503);
});
test('session stored only as a hash, cookie secured, reads shared across instances', async () => {
  const env = envFor(), now = Date.now(), result = await login(env, now);
  assert.equal(result.status, 200);
  assert.match(result.setCookie, /Secure; HttpOnly; SameSite=Strict/);
  const row = env.DB.sqlite.prepare('SELECT * FROM atlas_sessions').get();
  assert.notEqual(row.token_hash, cookieOf(result).split('=')[1]);
  assert.deepEqual(await readSession(req('/api/atlas-private', {cookie: cookieOf(result)}), {...env}, now), {expiresAt: result.body.expiresAt});
});
test('wrong codes and spoofed proxy headers share one global budget', async () => {
  const env = envFor(), now = Date.now();
  for (let i = 0; i < 5; i++) assert.equal((await sessionRoute(req('/api/atlas-session', {method: 'POST', headers: {'Content-Type': 'application/json', origin: ORIGIN, 'x-forwarded-for': String(i)}}), env, {pin: 'bad-password'}, now)).status, 401);
  assert.equal((await login({...env}, now)).status, 429);
  assert.equal((await login(env, now + 900001)).status, 200);
});
test('cross-origin login and logout rejected before writes', async () => {
  const env = envFor();
  for (const method of ['POST', 'DELETE']) assert.equal((await sessionRoute(req('/api/atlas-session', {method, origin: 'https://attacker.invalid'}), env, {pin: PIN})).status, 403);
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) n FROM atlas_sessions').get().n, 0);
});
test('verified custom domains accept only their own exact HTTPS origin, while original host still works',()=>{
 const origins=[ORIGIN,'https://nexo.denerpereira.com.br','https://nexoresearch.org'];
 for(const origin of origins){
  assert.equal(sameOrigin(new Request(origin+'/api/atlas-session',{headers:{Origin:origin,'Sec-Fetch-Site':'same-origin'}})),true);
  for(const other of origins.filter(value=>value!==origin))assert.equal(sameOrigin(new Request(origin+'/api/atlas-session',{headers:{Origin:other}})),false);
  assert.equal(sameOrigin(new Request(origin+'/api/atlas-session',{headers:{Origin:origin,'Sec-Fetch-Site':'cross-site'}})),false);
  assert.equal(sameOrigin(new Request(origin+'/api/atlas-session')),false);
 }
 for(const origin of ['https://www.nexoresearch.org','http://nexoresearch.org','https://nexoresearch.org:444','https://nexoresearch.org.attacker.invalid','https://attacker.invalid'])assert.equal(sameOrigin(new Request(origin+'/api/atlas-session',{headers:{Origin:origin}})),false);
});
test('new verified origin still denies anonymous private access without reading sources',async()=>{
 let called=0;const worker=createWorker({readSource:async()=>{called++;},readMemory:async()=>{called++;}}),env=envFor();
 for(const route of ['/api/atlas-private','/api/atlas-private-ui','/api/atlas-private-assets/index.html','/api/atlas-memory/browse','/api/atlas-knowledge/query']){
  const response=await worker.fetch(new Request('https://nexoresearch.org'+route,{headers:{Origin:'https://nexoresearch.org','Sec-Fetch-Site':'same-origin'}}),env);
  assert.equal(response.status,401,route);assert.deepEqual(await response.json(),{error:'AUTH_REQUIRED'});
 }
 assert.equal(called,0);
});
test('rotation and logout revoke the old token, credential rotation also invalidates it', async () => {
  const env = envFor(), first = await login(env), second = await login(env, Date.now(), cookieOf(first));
  assert.equal(await readSession(req('/', {cookie: cookieOf(first)}), env), null);
  assert.ok(await readSession(req('/', {cookie: cookieOf(second)}), env));
  assert.equal(await readSession(req('/', {cookie: cookieOf(second)}), {...env, NEXO_ATLAS_PIN_HASH: `scrypt$${'b'.repeat(32)}$${'c'.repeat(128)}`}), null);
  const cleared = await sessionRoute(req('/', {method: 'DELETE', cookie: cookieOf(second)}), env);
  assert.match(cleared.setCookie, /Max-Age=0/);
  assert.equal(await readSession(req('/', {cookie: cookieOf(second)}), env), null);
});
test('expiration, malformed and duplicate cookies cannot open the private route', async () => {
  const env = envFor(), now = Date.now(), result = await login(env, now), cookie = cookieOf(result);
  assert.equal(await readSession(req('/', {cookie}), env, now + 3600001), null);
  assert.equal(await readSession(req('/', {cookie: cookie + '; ' + cookie}), env, now), null);
  assert.equal(await readSession(req('/', {cookie: '__Host-atlas_session=invalid'}), env, now), null);
});
test('public route serves only its reviewed projection and private source never runs before auth', async () => {
  let called = 0; const worker = createWorker({readSource: async () => {called++;}}), env = envFor();
  assert.deepEqual(await (await worker.fetch(req('/api/atlas-public'), env)).json(), cosmologyPublicProjection(visualPublicProjection(publicEditorialProjection(publicAtlasProjection()))));
  for (const route of ['/api/atlas-private', '/api/atlas-private-ui', '/api/atlas-private-assets/index.html', '/api/handler?route=atlas-private', '/api/mcp', '/api/world', '/api/system']) assert.equal((await worker.fetch(req(route), env)).status, 401, route);
  assert.equal(called, 0);
});
test('auth store failure returns 503 and never invokes a source', async () => {
  let called = 0; const worker = createWorker({readSource: async () => {called++;}}), env = envFor();
  const session = await login(env);
  env.DB = {prepare() {throw new Error('DB offline');}};
  assert.equal((await worker.fetch(req('/api/atlas-private', {cookie: cookieOf(session)}), env)).status, 503);
  assert.equal(called, 0);
});
test('authenticated private response and guarded assets are no-store; unavailable source honest', async () => {
  const env = envFor(), session = await login(env), cookie = cookieOf(session);
  const worker = createWorker({readSource: async () => makePrivateRuntimeFixture()});
  const response = await worker.fetch(req('/api/atlas-private', {cookie, method: 'POST', body: '{}'}), env);
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer()))).data.access, 'PRIVATE');
  const ui = await worker.fetch(req('/api/atlas-private-ui', {cookie}), env);
  assert.equal(ui.status, 200); assert.match(ui.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.match(await ui.text(), /atlas-private-assets/);
  assert.equal((await createWorker().fetch(req('/api/atlas-private', {cookie, method: 'POST', body: '{}'}), env)).status, 503);
});
test('private code uses precompressed bytes only after auth and only when gzip is accepted', async () => {
  const raw = Buffer.from('synthetic private asset '.repeat(100));
  const worker = createWorker({assets: {'assets/synthetic.js': {type: 'text/javascript', gzipBase64: gzipSync(raw).toString('base64')}}});
  const env = envFor(), session = await login(env), cookie = cookieOf(session), route = '/api/atlas-private-assets/assets/synthetic.js';
  assert.equal((await worker.fetch(req(route, {headers: {'Accept-Encoding': 'gzip'}}), env)).status, 401);
  for (const accept of ['gzip', 'br, gzip;q=1', 'gzip;q=0', 'br', '']) {
    const response = await worker.fetch(req(route, {cookie, headers: {'Accept-Encoding': accept}}), env);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    assert.match(response.headers.get('vary'), /Accept-Encoding/);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (accept === 'gzip' || accept === 'br, gzip;q=1') {assert.equal(response.headers.get('content-encoding'), 'gzip'); assert.deepEqual(gunzipSync(bytes), raw);}
    else {assert.equal(response.headers.get('content-encoding'), null); assert.deepEqual(bytes, raw);}
  }
});
test('revocation, PIN rotation and owner changes during source load discard the completed runtime', async () => {
  for (const invalidate of [
    env => env.DB.sqlite.exec('DELETE FROM atlas_sessions'),
    env => env.DB.sqlite.prepare('UPDATE atlas_sessions SET expires_at = ?').run(Date.now() - 1),
    env => env.DB.sqlite.prepare('UPDATE atlas_owner SET pin_hash = ?').run(`scrypt$${'b'.repeat(32)}$${'c'.repeat(128)}`),
    env => env.DB.sqlite.prepare('UPDATE atlas_owner SET user_id = ?').run('another-owner'),
  ]) {
    const env = envFor(), session = await login(env), cookie = cookieOf(session);
    const worker = createWorker({readSource: async () => {invalidate(env); return makePrivateRuntimeFixture();}});
    const response = await worker.fetch(req('/api/atlas-private', {cookie, method: 'POST', body: '{}'}), env);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {error: 'AUTH_REQUIRED'});
  }
});
test('connector recovery is classified only for the still-authorized owner and never includes payload details',async t=>{
 t.mock.method(console,'error',()=>{});
 for(const [status,recovery] of [['reauthentication_required','REAUTHORIZE_CONNECTOR'],['connector_access_disabled','CHECK_CONNECTOR_ACCESS'],['upstream_error','RETRY_SOURCE']]){
  const env=envFor(),cookie=cookieOf(await login(env));
  const error=Object.assign(Error('CONNECTOR_LIST_FILE_REVISIONS_FAILED'),{connectorStatus:status});
  const worker=createWorker({readSource:async()=>{throw error;}});
  const response=await worker.fetch(req('/api/atlas-private',{cookie,method:'POST',body:'{}'}),env);
  assert.equal(response.status,503);assert.match(response.headers.get('Cache-Control'),/no-store/);
  assert.deepEqual(await response.json(),{error:'PRIVATE_SOURCE_UNAVAILABLE',diagnostic:error.message,connectorStatus:status,recovery});
 }
 for(const invalidate of [env=>env.DB.sqlite.exec('DELETE FROM atlas_sessions'),env=>env.DB.sqlite.prepare('UPDATE atlas_owner SET user_id=?').run('other-owner')]){
  const env=envFor(),cookie=cookieOf(await login(env));
  const worker=createWorker({readSource:async()=>{invalidate(env);throw Object.assign(Error('CONNECTOR_LIST_FILE_REVISIONS_FAILED'),{connectorStatus:'reauthentication_required'});}});
  const response=await worker.fetch(req('/api/atlas-private',{cookie,method:'POST',body:'{}'}),env);
  assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'AUTH_REQUIRED'});
 }
});
test('private runtime rejects non-JSON requests before source reads and reports source contention with bounded retry timing',async()=>{
 const env=envFor(),cookie=cookieOf(await login(env));let reads=0,finish;
 const worker=createWorker({readSource:async()=>{reads++;return new Promise(resolve=>{finish=resolve;});}});
 const wrong=await worker.fetch(req('/api/atlas-private',{cookie,method:'POST',body:'{}',headers:{'Content-Type':'text/plain'}}),env);
 assert.equal(wrong.status,415);assert.equal(reads,0);
 const pending=worker.fetch(req('/api/atlas-private',{cookie,method:'POST',body:'{}'}),env);
 while(!finish)await new Promise(resolve=>setImmediate(resolve));
 const busy=await worker.fetch(req('/api/atlas-private',{cookie,method:'POST',body:'{}'}),env);
 assert.equal(busy.status,503);assert.equal(busy.headers.get('Retry-After'),'3');
 assert.deepEqual(await busy.json(),{error:'PRIVATE_SOURCE_UNAVAILABLE',recovery:'RETRY_SOURCE',retryAfter:3});
 assert.equal(reads,1);finish(makePrivateRuntimeFixture());assert.equal((await pending).status,200);
});
test('private files cannot bypass the guard through public assets or source URLs', async () => {
  const worker = createWorker(), env = envFor();
  for (const route of ['/server/index.js', '/server/private-ui/index.html', '/.sites-runtime/private-assets.mjs', '/src/private-legacy/Host.tsx', '/worker/source.mjs', '/drizzle/0000.sql', '/assets/../server/index.js']) assert.equal((await worker.fetch(req(route), env)).status, 404, route);
  assert.match(await (await worker.fetch(req('/'), env)).text(), /PUBLIC_ONLY/);
});
test('private Nunito and Barlow fonts use guarded MIME-typed assets', async () => {
  const manifest = JSON.parse(readFileSync('server/private-ui/manifest.json','utf8'));
  const fonts = Object.keys(manifest.files).filter(name => /(?:Nunito|Barlow).*\.ttf$/.test(name));
  assert.equal(fonts.length,3);
  const env = envFor(), session = await login(env), cookie = cookieOf(session), worker = createWorker();
  for (const font of fonts) {
    const route = '/api/atlas-private-assets/' + font;
    assert.equal((await worker.fetch(req(route),env)).status,401);
    const response = await worker.fetch(req(route,{cookie}),env);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'font/ttf');
    assert.match(response.headers.get('cache-control'),/no-store/);
    assert.ok((await response.arrayBuffer()).byteLength>1000);
  }
});
test('unexpected private asset names and route aliases cannot escape the manifest', async () => {
  const env = envFor(), session = await login(env), cookie = cookieOf(session), worker = createWorker();
  for (const route of ['/api/atlas-private-assets/not-found.js', '/api/atlas-private-assets/%2e%2e%2findex.html', '/api/handler?route=atlas-private']) assert.equal((await worker.fetch(req(route, {cookie}), env)).status, 404);
});
test('body size and malformed JSON are bounded', async () => {
  const env = envFor(), worker = createWorker();
  assert.equal((await worker.fetch(req('/api/atlas-session', {method: 'POST', body: 'x'.repeat(1025)}), env)).status, 413);
  assert.equal((await worker.fetch(req('/api/atlas-session', {method: 'POST', body: '{'}), env)).status, 400);
});
test('source not configured never performs a network request', async () => {
  assert.equal(sourceConfigured({}), false);
  await assert.rejects(() => readPrivate({}, () => {throw new Error('must not fetch');}), /PRIVATE_SOURCE_NOT_CONFIGURED/);
});
test('public browser build contains no private module names, records or credentials', () => {
  const walk = dir => readdirSync(dir).flatMap(n => {const p = path.join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p];});
  const files = walk('dist/client');
  assert.ok(files.some(f => f.endsWith('index.html')));
  const text = files.filter(f => /\.(html|js|css)$/.test(f)).map(f => readFileSync(f, 'utf8')).join('\n');
  for (const forbidden of ['Synthetic private task', 'NEXO_TOWER_LIVE.json', 'NEXO_ATLAS_PIN_HASH', 'GOOGLE_REFRESH_TOKEN', 'PRIVATE_SOURCE_TOKEN', 'PrivateWorkspace-', 'AgentBoardView-', 'evolution/board.json', 'EMPTY_REFERENCE_SURFACE', 'TowerCosmos-', 'MemoryView-', 'ATLAS_MEMORY_OWNER_ANNOTATION_V1', 'nexo_memory_search', 'nexo_knowledge_graph', 'ATLAS_PRIVATE_KNOWLEDGE_V1', '1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z']) assert.equal(text.includes(forbidden), false, forbidden);
  assert.equal(files.some(f => /private-ui|server|\.map$/.test(f)), false);
});


test('memory endpoints require owner identity, PIN session, CSRF and JSON before source reads', async () => {
  let reads=0; const worker=createWorker({readMemory:async()=>{reads++;return makePrivateRuntimeFixture();}}), env=envFor();
  for(const endpoint of ['/api/atlas-memory/browse','/api/atlas-memory/propose','/api/atlas-memory/apply','/api/atlas-knowledge/query'])assert.equal((await worker.fetch(req(endpoint,{method:'POST',body:'{}'}),env)).status,401);
  const session=await login(env),cookie=cookieOf(session);
  assert.equal((await worker.fetch(req('/api/atlas-memory/browse',{cookie,method:'POST',origin:'https://attacker.invalid',body:'{}'}),env)).status,403);
  assert.equal((await worker.fetch(req('/api/atlas-memory/browse',{cookie,method:'POST',headers:{'oai-authenticated-user-id':'another-user'},body:'{}'}),env)).status,401);
  assert.equal((await worker.fetch(req('/api/atlas-memory/browse',{cookie,method:'GET'}),env)).status,405);
  assert.equal((await worker.fetch(req('/api/atlas-memory/propose',{cookie,method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'}),env)).status,415);
  assert.equal((await worker.fetch(req('/api/atlas-memory/propose',{cookie,method:'POST',body:'x'.repeat(16385)}),env)).status,413);
  assert.equal(reads,0);
});
test('knowledge endpoint preserves owner/PIN/CSRF/size/no-store and discards revoked-session results',async()=>{
 const {memoryFixture}=await import('./helpers/memory.fixture.mjs');
 let reads=0;const env=envFor(),session=await login(env),cookie=cookieOf(session),route='/api/atlas-knowledge/query';
 const worker=createWorker({readMemory:async()=>{reads++;return memoryFixture();}});
 assert.equal((await worker.fetch(req(route,{cookie,method:'POST',origin:'https://attacker.invalid',body:'{}'}),env)).status,403);
 assert.equal((await worker.fetch(req(route,{cookie,method:'POST',headers:{'oai-authenticated-user-id':'other-user'},body:'{}'}),env)).status,401);
 assert.equal((await worker.fetch(req(route,{cookie,method:'GET'}),env)).status,405);
 assert.equal((await worker.fetch(req(route,{cookie,method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'}),env)).status,415);
 assert.equal((await worker.fetch(req(route,{cookie,method:'POST',body:'x'.repeat(16385)}),env)).status,413);
 assert.equal((await worker.fetch(req(route,{cookie,method:'POST',body:JSON.stringify({url:'https://attacker.invalid'})}),env)).status,400);
 assert.equal(reads,0);
 const result=await worker.fetch(req(route,{cookie,method:'POST',body:JSON.stringify({seed_id:'T-1'})}),env);assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/no-store/);assert.equal((await result.json()).contract,'ATLAS_PRIVATE_KNOWLEDGE_V1');
 const closed=createWorker({readMemory:async()=>{env.DB.sqlite.exec('DELETE FROM atlas_sessions');return memoryFixture();}});
 const denied=await closed.fetch(req(route,{cookie,method:'POST',body:'{}'}),env);assert.equal(denied.status,401);assert.deepEqual(await denied.json(),{error:'AUTH_REQUIRED'});
});
test('memory source data is no-store, apply is explicitly unavailable, and logout during reads discards results',async()=>{
  const {memoryFixture}=await import('./helpers/memory.fixture.mjs');
  const env=envFor(),session=await login(env),cookie=cookieOf(session),worker=createWorker({readMemory:async()=>memoryFixture()});
  const response=await worker.fetch(req('/api/atlas-memory/browse',{cookie,method:'POST',body:'{}'}),env);
  assert.equal(response.status,200);assert.equal((await response.json()).access,'PRIVATE');assert.match(response.headers.get('Cache-Control'),/no-store/);
  const blocked=await worker.fetch(req('/api/atlas-memory/apply',{cookie,method:'POST',body:'{}'}),env);assert.equal(blocked.status,503);assert.equal((await blocked.json()).applied,false);
  const revoking=createWorker({readMemory:async()=>{await sessionRoute(req('/',{method:'DELETE',cookie}),env);return memoryFixture();}});
  const revoked=await revoking.fetch(req('/api/atlas-memory/browse',{cookie,method:'POST',body:'{}'}),env);assert.equal(revoked.status,401);assert.equal((await revoked.text()).includes('Expansion'),false);
});


test('canonical mural and protected source links stay behind pinned owner plus PIN, then revoke on logout', async () => {
  const {compilePrivateTowerRuntime}=await import('../server/atlas/private-tower.mjs');
  const {makePrivateTowerFixture}=await import('./helpers/private-tower.fixture.mjs');
  const tower=makePrivateTowerFixture();
  tower.files['evolution/board.json']={encoding:'json',value:{posts:[{id:'PRIVATE-POST',at:tower.updated_at,from:'ENGINEER',to:'EXECUTOR',private:true,text:'PRIVATE_BOARD_CANARY',refs:['OLYMPUS','PEER/PER','https://example.invalid/private-link']}]}};
  tower.file_count=Object.keys(tower.files).length;
  const runtime=compilePrivateTowerRuntime(tower),env=envFor();let reads=0;
  const worker=createWorker({readSource:async()=>{reads++;return runtime;}});
  for (const headers of [{},{'oai-authenticated-user-id':'another-user'}]) {
    const response=await worker.fetch(req('/api/atlas-private',{method:'POST',body:'{}',headers}),env);assert.equal(response.status,401);assert.doesNotMatch(await response.text(),/PRIVATE_BOARD_CANARY|private-link|PEER/);
  }
  assert.equal(reads,0);
  const session=await login(env),cookie=cookieOf(session);
  const other=await worker.fetch(req('/api/atlas-private',{method:'POST',body:'{}',cookie,headers:{'oai-authenticated-user-id':'another-user'}}),env);assert.equal(other.status,401);assert.equal(reads,0);
  const response=await worker.fetch(req('/api/atlas-private',{method:'POST',body:'{}',cookie}),env);
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);
  const payload=JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())));assert.equal(payload.data.system.read_model.evolution.board.posts[0].text,'PRIVATE_BOARD_CANARY');
  const publicText=await (await worker.fetch(req('/api/atlas-public'),env)).text();assert.doesNotMatch(publicText,/PRIVATE_BOARD_CANARY|private-link|PEER/);
  await sessionRoute(req('/api/atlas-session',{method:'DELETE',cookie}),env);
  assert.equal((await worker.fetch(req('/api/atlas-private',{method:'POST',body:'{}',cookie}),env)).status,401);assert.equal(reads,1);
});

test('on-demand private tests enforce owner, session, CSRF, shape, revision and post-read revocation without source reads for invalid requests',async()=>{
 const {makePrivateTowerFixture}=await import('./helpers/private-tower.fixture.mjs');const tower=makePrivateTowerFixture();
 const env=envFor(),session=await login(env),cookie=cookieOf(session);let reads=0;
 const worker=createWorker({readMemory:async()=>{reads++;return tower;}}),route='/api/atlas-private/test',body=JSON.stringify({id:'TEST-01',expected_revision:tower.revision});
 for(const options of [{},{cookie,headers:{'oai-authenticated-user-id':'other'}}])assert.equal((await worker.fetch(req(route,{...options,method:'POST',body}),env)).status,401);
 assert.equal((await worker.fetch(req(route,{cookie,method:'POST',body,origin:'https://attacker.invalid'}),env)).status,403);
 assert.equal((await worker.fetch(req(route,{cookie,method:'GET'}),env)).status,405);
 assert.equal((await worker.fetch(req(route,{cookie,method:'POST',body,headers:{'Content-Type':'text/plain'}}),env)).status,415);
 for(const bad of ['{}','{',JSON.stringify({id:'TEST-01',expected_revision:tower.revision,url:'https://attacker.invalid'}),'x'.repeat(2049)])assert.equal((await worker.fetch(req(route,{cookie,method:'POST',body:bad}),env)).status,400);
 assert.equal(reads,0);
 const response=await worker.fetch(req(route,{cookie,method:'POST',body}),env);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);
 const data=JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())));assert.equal(data.access,'PRIVATE');assert.equal(data.record.id,'TEST-01');assert.equal(data.record.domain,'OLYMPUS');assert.equal(data.source_revision,tower.revision);
 const stale=await worker.fetch(req(route,{cookie,method:'POST',body:JSON.stringify({id:'TEST-01',expected_revision:'sha256:'+'f'.repeat(64)})}),env);assert.equal(stale.status,409);assert.deepEqual(await stale.json(),{error:'SOURCE_REVISION_CHANGED'});
 for(const revoke of [env=>env.DB.sqlite.exec('DELETE FROM atlas_sessions'),env=>env.DB.sqlite.prepare('UPDATE atlas_owner SET user_id=?').run('another-owner'),env=>env.DB.sqlite.prepare('UPDATE atlas_sessions SET expires_at=?').run(Date.now()-1)]){
  const next=envFor(),s=await login(next),c=cookieOf(s),w=createWorker({readMemory:async()=>{revoke(next);return tower;}});
  const denied=await w.fetch(req(route,{cookie:c,method:'POST',body}),next);assert.equal(denied.status,401);assert.doesNotMatch(await denied.text(),/OLYMPUS|TEST-01/);
 }
});
test('workspace profile is opt-in at the existing guarded endpoint and rejects unsupported profiles before reading',async()=>{
 const env=envFor(),session=await login(env),cookie=cookieOf(session);let reads=0,profile;
 const worker=createWorker({readSource:async(_env,_fetch,options)=>{reads++;profile=options.profile;return makePrivateRuntimeFixture();}});
 assert.equal((await worker.fetch(req('/api/atlas-private',{cookie,method:'POST',body:'{"profile":"workspace-v1"}'}),env)).status,200);assert.equal(profile,'workspace-v1');
 assert.equal((await worker.fetch(req('/api/atlas-private',{cookie,method:'POST',body:'{}'}),env)).status,200);assert.equal(profile,undefined);
 assert.equal((await worker.fetch(req('/api/atlas-private',{cookie,method:'POST',body:'{"profile":"public"}'}),env)).status,400);assert.equal(reads,2);
});
