import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('monorepo root Vercel shim builds and serves nexo-one',async()=>{
  const config=JSON.parse(await text('../vercel.json'));
  const api=await text('../api/index.js');
  assert.match(config.installCommand,/cd nexo-one/);
  assert.match(config.buildCommand,/cd nexo-one/);
  assert.equal(config.outputDirectory,'nexo-one/dist');
  assert.ok(config.functions?.['api/index.js']);
  assert.ok(config.rewrites.some(entry=>entry.source==='/api/:route'&&entry.destination.includes('/api/index')));
  assert.match(api,/nexo-one\/server\/handler\.mjs/);
});
