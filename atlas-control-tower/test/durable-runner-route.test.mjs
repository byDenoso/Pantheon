import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);

test('Vercel exposes the durable runner as one bounded function route', async()=>{
  const cfg=JSON.parse(await readFile(new URL('vercel.json',root),'utf8'));
  assert(cfg.builds.some(x=>x.src==='api/runner.js'&&x.use==='@vercel/node'));
  assert(cfg.routes.some(x=>x.src==='/api/runner'&&x.dest==='/api/runner.js'));
});

test('runner endpoint accepts GET only and never exposes arbitrary SQL',async()=>{
  const source=await readFile(new URL('api/runner.js',root),'utf8');
  assert.match(source,/req\.method!=='GET'/);
  assert.doesNotMatch(source,/run_sql|arbitrary_sql|query\s*=/i);
  assert.match(source,/createRunnerBridge/);
});
