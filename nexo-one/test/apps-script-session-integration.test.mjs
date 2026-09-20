import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const text=relative=>readFile(path.join(root,relative),'utf8');

test('private session prefers native Vercel runtime and retains Apps Script fallback for static Pages',async()=>{
  const source=await text('src/app/useSession.ts');
  assert.match(source,/VERCEL_NATIVE/);
  assert.match(source,/fetch\('\/api\/session'/);
  assert.match(source,/credentials:'same-origin'/);
  assert.match(source,/createAppsScriptAuthBridge/);
  assert.match(source,/VITE_NEXO_AUTH_BRIDGE_URL/);
  assert.match(source,/APPS_SCRIPT_BRIDGE/);
});

test('static host without bridge config fails closed to public-only mode',async()=>{
  const source=await text('src/app/useSession.ts');
  assert.match(source,/setRuntimeAvailable\(false\)/);
  assert.match(source,/bindRuntime\('NONE'\)/);
  assert.match(source,/configured:false,authenticated:false/);
});

test('integration preserves PIN and rate-limit messages and clears bridge tokens',async()=>{
  const source=await text('src/app/useSession.ts');
  assert.match(source,/PIN inválido\./);
  assert.match(source,/Muitas tentativas\. Aguarde 15 minutos\./);
  assert.match(source,/clearStoredSessionToken/);
  assert.match(source,/SESSION_EXPIRED/);
});

test('bridge login sends a bounded per-browser identifier without persisting the PIN',async()=>{
  const source=await text('src/auth/apps-script-bridge.mjs');
  assert.match(source,/SESSION_LOGIN[^\n]+browserId/);
  assert.doesNotMatch(source,/localStorage/);
});
