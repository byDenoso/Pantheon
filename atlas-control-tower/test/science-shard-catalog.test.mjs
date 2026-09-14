import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {discoverScienceShards} from '../lib/science-shard-catalog.mjs';

function fixtureDir(files={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-shards-'));
  const dir=path.join(root,'science-drive-projection');
  fs.mkdirSync(dir,{recursive:true});
  for(const [name,value] of Object.entries(files))fs.writeFileSync(path.join(dir,name),JSON.stringify(value));
  return root;
}

test('discovers generated D/CROSS shards when canonical index omits shards map',()=>{
  const dataDir=fixtureDir({
    'D1.json':{sourceVersion:'v1',tests:[{id:'T1'},{id:'T2'}]},
    'D10.json':{sourceVersion:'v1',tests:[{id:'T10'}]},
    'CROSS.json':{sourceVersion:'v1',tests:[{id:'TX'}]}
  });
  const catalog=discoverScienceShards({scienceIndex:{campaigns:[]},dataDir});
  assert.deepEqual(catalog.map(x=>x.id),['D1','D10','CROSS']);
  const d1=catalog.find(x=>x.id==='D1');
  assert.equal(d1.state,'READY');
  assert.equal(d1.includedCount,2);
  assert.match(d1.sha256,/^sha256:[0-9a-f]{64}$/);
});

test('declared tests with no provable shard never become a successful empty shard',()=>{
  const dataDir=fixtureDir({});
  const catalog=discoverScienceShards({
    scienceIndex:{campaigns:[{id:'C1',domain:'D1',testCount:127}]},
    dataDir
  });
  const d1=catalog.find(x=>x.id==='D1');
  assert.ok(d1);
  assert.equal(d1.declaredCount,127);
  assert.equal(d1.includedCount,0);
  assert.equal(d1.state,'DATA_UNAVAILABLE');
});

test('explicit shard catalog has precedence and preserves truncation/completeness',()=>{
  const dataDir=fixtureDir({'D1.json':{sourceVersion:'fallback',tests:[{id:'fallback'}]}});
  const catalog=discoverScienceShards({
    scienceIndex:{
      shards:{D1:'science-drive-projection/D1.json'},
      completeness:{byShard:{D1:{declared:5,included:1,truncated:true}}},
      campaigns:[{id:'C1',domain:'D1',testCount:5}]
    },
    dataDir
  });
  const d1=catalog.find(x=>x.id==='D1');
  assert.equal(d1.declaredCount,5);
  assert.equal(d1.includedCount,1);
  assert.equal(d1.truncated,true);
  assert.equal(d1.state,'PARTIAL');
});
