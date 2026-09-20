import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('legacy monorepo Vercel runtime remains structurally valid during migration',async()=>{
  const config=JSON.parse(await text('../vercel.json'));
  const api=await text('../api/index.js');
  assert.match(config.installCommand,/cd nexo-one/);
  assert.match(config.buildCommand,/cd nexo-one/);
  assert.equal(config.outputDirectory,'nexo-one/dist');
  assert.equal(config.functions,undefined);
  assert.ok(config.rewrites.some(entry=>entry.source==='/api/:route'&&entry.destination.includes('/api/index')));
  assert.match(api,/module\.exports\s*=\s*async function/);
  assert.match(api,/await import\('\.\.\/nexo-one\/server\/handler\.mjs'\)/);
  assert.doesNotMatch(api,/^import\s+handler/m);
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
  assert.match(app,/VITE_NEXO_AUTH_BRIDGE_URL/);
  assert.match(session,/createAppsScriptAuthBridge/);
  assert.match(session,/PIN inválido\./);
  assert.doesNotMatch(session,/fetch\(['"]\/api\/session/);
});

test('avatar opens the local session modal and never replaces the current cockpit',async()=>{
  const app=await text('src/app/App.tsx');
  const openSession=app.match(/const openSession = \(\) => \{([\s\S]*?)\n  \};/)?.[1]||'';
  assert.match(openSession,/setLoginOpen\(true\)/);
  assert.doesNotMatch(openSession,/window\.location\.(?:assign|replace)/);
  assert.match(app,/Abrir conta e sessão/);
  assert.match(app,/window\.open\(target\.toString\(\), '_blank', 'noopener,noreferrer'\)/);
  assert.match(app,/Abrir cockpit privado em nova aba/);
});

test('numeric PIN mode is protected by Apps Script server-side rate limiting',async()=>{
  const code=await text('apps-script-auth/Code.gs');
  assert.match(code,/NEXO_BROWSER_FAILURE_LIMIT=5/);
  assert.match(code,/NEXO_GLOBAL_FAILURE_LIMIT=50/);
  assert.match(code,/NEXO_RATE_WINDOW_SECONDS=15\*60/);
  assert.match(code,/LockService\.getScriptLock\(\)/);
  assert.match(code,/RATE_LIMITED/);
});

test('GitHub Pages injects only the non-secret Apps Script bridge URL',async()=>{
  const workflow=await text('../.github/workflows/nexo-one-pages.yml');
  assert.match(workflow,/VITE_NEXO_AUTH_BRIDGE_URL:\s*\$\{\{ vars\.VITE_NEXO_AUTH_BRIDGE_URL \}\}/);
  assert.doesNotMatch(workflow,/NEXO_PIN_HASH:/);
  assert.doesNotMatch(workflow,/NEXO_SESSION_SECRET:/);
  assert.doesNotMatch(workflow,/NEXO_PIN:/);
});
