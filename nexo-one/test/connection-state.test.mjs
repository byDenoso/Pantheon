import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {summarizeConnectionHealth} from '../server/health/connection-state.mjs';

const provider=(id,status)=>({id,status});

test('separates private session readiness from provider credential readiness',()=>{
  const env={NEXO_PASSWORD_HASH:'hash',NEXO_SESSION_SECRET:'x'.repeat(32)};
  const result=summarizeConnectionHealth({env,providers:[provider('gmail','AUTH_REQUIRED'),provider('calendar','AUTH_REQUIRED'),provider('drive','AUTH_REQUIRED')]});
  assert.equal(result.session.configured,true);
  assert.equal(result.connections.google.configured,false);
  assert.equal(result.connections.google.authorized,false);
  assert.equal(result.connections.google.runtimeVerified,false);
});

test('configured google connector remains unauthorized until a provider succeeds at runtime',()=>{
  const env={GOOGLE_CONNECTOR:'google/account',VERCEL_OIDC_TOKEN:'oidc'};
  const result=summarizeConnectionHealth({env,providers:[provider('gmail','AUTH_REQUIRED'),provider('calendar','AUTH_REQUIRED'),provider('drive','AUTH_REQUIRED')]});
  assert.equal(result.connections.google.configured,true);
  assert.equal(result.connections.google.authorized,false);
  assert.equal(result.connections.google.runtimeVerified,false);
});

test('marks google authorized only from observed provider availability',()=>{
  const env={GOOGLE_CONNECTOR:'google/account',VERCEL_OIDC_TOKEN:'oidc'};
  const result=summarizeConnectionHealth({env,providers:[provider('gmail','AVAILABLE'),provider('calendar','AVAILABLE'),provider('drive','AVAILABLE')]});
  assert.equal(result.connections.google.configured,true);
  assert.equal(result.connections.google.authorized,true);
  assert.equal(result.connections.google.runtimeVerified,true);
});

test('reports atlas and vercel configuration independently',()=>{
  const env={ATLAS_GRAPH_URL:'https://atlas.example/api/graph',ATLAS_SOURCE_TOKEN:'atlas-token',VERCEL_READ_TOKEN:'vercel-token',VERCEL_PROJECT_ID:'prj_test'};
  const result=summarizeConnectionHealth({env,providers:[provider('atlas','AVAILABLE'),provider('vercel','AUTH_REQUIRED')]});
  assert.equal(result.connections.atlas.configured,true);
  assert.equal(result.connections.atlas.runtimeVerified,true);
  assert.equal(result.connections.vercel.configured,true);
  assert.equal(result.connections.vercel.runtimeVerified,false);
});

test('health route publishes explicit session and connection readiness while keeping legacy privateConfigured',async()=>{
  const source=await readFile(new URL('../server/handler.mjs',import.meta.url),'utf8');
  assert.match(source,/summarizeConnectionHealth/);
  assert.match(source,/sessionConfigured:connectionHealth\.session\.configured/);
  assert.match(source,/privateConfigured:connectionHealth\.session\.configured/);
  assert.match(source,/connections:connectionHealth\.connections/);
});
