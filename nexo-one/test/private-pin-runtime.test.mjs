import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

// Regression contract: Pages hands private access to a real Vercel runtime with PIN auth.
test('monorepo root Vercel deployment delegates to nexo-one',async()=>{
  const config=JSON.parse(await text('../vercel.json'));
  const api=await text('../api/index.js');
  assert.match(config.installCommand,/cd nexo-one/);
  assert.match(config.buildCommand,/cd nexo-one/);
  assert.equal(config.outputDirectory,'nexo-one/dist');
  assert.ok(config.functions?.['api/index.js']);
  assert.ok(config.rewrites.some(entry=>entry.source==='/api/:route'&&entry.destination.includes('/api/index')));
  assert.match(api,/nexo-one\/server\/handler\.mjs/);
});

test('private access UI is a numeric PIN flow with ephemeral input',async()=>{
  const app=await text('src/app/App.tsx');
  const session=await text('src/app/useSession.ts');
  assert.match(app,/const \[pin, setPin\]/);
  assert.match(app,/<label>PIN/);
  assert.match(app,/inputMode="numeric"/);
  assert.match(app,/setPin\(event\.target\.value\.replace\(\/\\D\/g,''\)\)/);
  assert.match(app,/const submitted=pin;setPin\(''\)/);
  assert.doesNotMatch(app,/Senha do NEXO ONE/);
  assert.match(session,/credentials:'same-origin'/);
  assert.match(session,/PIN inválido\./);
});

test('numeric PIN mode is protected by server-side rate limiting',async()=>{
  const route=await text('server/auth/session-route.mjs');
  const password=await text('scripts/password.mjs');
  assert.match(route,/login-rate-limit\.mjs/);
  assert.match(route,/status:429/);
  assert.match(route,/recordLoginFailure/);
  assert.match(password,/--pin/);
  assert.match(password,/\^\\d\{4,12\}\$/);
});
