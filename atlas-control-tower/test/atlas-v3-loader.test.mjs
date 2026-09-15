import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const loaderUrl=new URL('../src/atlas-v3/projection-loader.mjs',import.meta.url);

test('Projection V3 loader rejects authority and fingerprint divergence',async()=>{
  assert.equal(fs.existsSync(loaderUrl),true,'projection loader must exist');
  const {validateAtlasV3Snapshot}=await import(loaderUrl);
  const manifest={authority:'TOWER_V06',projectionOnly:true,fingerprint:'sha256:abc'};
  assert.doesNotThrow(()=>validateAtlasV3Snapshot(manifest,{manifest:{...manifest}}));
  assert.throws(()=>validateAtlasV3Snapshot(manifest,{manifest:{...manifest,authority:'GOOGLE_DRIVE'}}),/authority/i);
  assert.throws(()=>validateAtlasV3Snapshot(manifest,{manifest:{...manifest,fingerprint:'sha256:def'}}),/fingerprint/i);
  assert.throws(()=>validateAtlasV3Snapshot(manifest,{manifest:{...manifest,projectionOnly:false}}),/projection/i);
});
