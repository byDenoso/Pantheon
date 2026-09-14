import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=path.resolve(process.cwd());

test('static generator publishes manifest v3, SRM V2 and both ledgers beside v2 compatibility',()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-srm-static-'));
  execFileSync(process.execPath,['scripts/generate-static-state.mjs',out],{cwd:root,stdio:'pipe'});
  const v3=JSON.parse(fs.readFileSync(path.join(out,'current','public-manifest-v3.json'),'utf8'));
  const v2=JSON.parse(fs.readFileSync(path.join(out,'current','public-manifest-v2.json'),'utf8'));
  const legacy=JSON.parse(fs.readFileSync(path.join(out,'current','manifest.json'),'utf8'));
  assert.equal(v3.contract,'NEXO_ATLAS_PUBLIC_MANIFEST_V3');
  assert.equal(v2.contract,'NEXO_ATLAS_PUBLIC_MANIFEST_V2');
  const snap=path.join(out,legacy.snapshotPath);
  const srm=JSON.parse(fs.readFileSync(path.join(snap,v3.artifacts.srm.path),'utf8'));
  const projection=JSON.parse(fs.readFileSync(path.join(snap,v3.artifacts.projectionLedger.path),'utf8'));
  const activity=JSON.parse(fs.readFileSync(path.join(snap,v3.artifacts.activityLedger.path),'utf8'));
  const shards=JSON.parse(fs.readFileSync(path.join(snap,v3.artifacts.shards.path),'utf8'));
  assert.equal(srm.contract,'NEXO_SCIENCE_READ_MODEL_V2');
  assert.equal(projection.contract,'NEXO_PROJECTION_LEDGER_V1');
  assert.equal(activity.contract,'NEXO_ACTIVITY_LEDGER_V1');
  assert.equal(shards.contract,'NEXO_SCIENCE_SHARD_CATALOG_V1');
  assert.ok(srm.structure.programs.length>=1);
  assert.ok(srm.structure.campaigns.length>=1);
  assert.ok(srm.investigation.tests.length>=1);
  assert.ok(srm.observations.some(item=>item.metricId==='cosmology.H0'));
  assert.equal(v3.completeness.shards,shards.items.length);
});
