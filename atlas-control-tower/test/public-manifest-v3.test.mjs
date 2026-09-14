import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPublicManifestV3,validatePublicManifestV3} from '../lib/public-manifest-v3.mjs';

const sha=n=>String(n).repeat(64).slice(0,64).replace(/[^a-f0-9]/g,'a');
const artifacts={
  srm:{state:'READY',contract:'NEXO_SCIENCE_READ_MODEL_V2',path:'srm-v2/index.json',sha256:sha('a')},
  projectionLedger:{state:'READY',contract:'NEXO_PROJECTION_LEDGER_V1',path:'projection-ledger/index.json',sha256:sha('b')},
  activityLedger:{state:'READY',contract:'NEXO_ACTIVITY_LEDGER_V1',path:'activity-ledger/index.json',sha256:sha('c')},
  shards:{state:'READY',contract:'NEXO_SCIENCE_SHARD_CATALOG_V1',path:'shards/index.json',sha256:sha('d')}
};
const surfaces={graph:{state:'READY',contract:'atlas-structural-graph-v1',path:'graph/root.json',sha256:sha('e')},observatory:{state:'READY',contract:'NEXO_ATLAS_OBSERVATORY_V1',path:'surfaces/observatory/index.json',sha256:sha('f')}};

test('manifest v3 includes SRM ledgers shard catalog and v2 compatibility surfaces',()=>{
  const manifest=buildPublicManifestV3({sourceVersion:'drive-v1',generatedAt:'now',artifacts,surfaces,completeness:{shards:11}});
  assert.equal(manifest.contract,'NEXO_ATLAS_PUBLIC_MANIFEST_V3');
  assert.equal(manifest.artifacts.srm.contract,'NEXO_SCIENCE_READ_MODEL_V2');
  assert.equal(manifest.artifacts.projectionLedger.path,'projection-ledger/index.json');
  assert.equal(manifest.artifacts.activityLedger.path,'activity-ledger/index.json');
  assert.equal(manifest.artifacts.shards.path,'shards/index.json');
  assert.equal(manifest.surfaces.observatory.contract,'NEXO_ATLAS_OBSERVATORY_V1');
  assert.equal(manifest.completeness.shards,11);
  assert.doesNotThrow(()=>validatePublicManifestV3(manifest));
});

test('manifest fingerprint is semantic and ignores generatedAt',()=>{
  const a=buildPublicManifestV3({sourceVersion:'drive-v1',generatedAt:'a',artifacts,surfaces});
  const b=buildPublicManifestV3({sourceVersion:'drive-v1',generatedAt:'b',artifacts,surfaces});
  assert.equal(a.fingerprint,b.fingerprint);
});

test('tampered artifact hash invalidates manifest fingerprint',()=>{
  const manifest=buildPublicManifestV3({sourceVersion:'drive-v1',artifacts,surfaces});
  const tampered=structuredClone(manifest);
  tampered.artifacts.srm.sha256=sha('9');
  assert.throws(()=>validatePublicManifestV3(tampered),/FINGERPRINT_MISMATCH/);
});

test('critical SRM artifacts must be READY while compatibility surfaces may be unavailable',()=>{
  assert.throws(()=>buildPublicManifestV3({sourceVersion:'drive-v1',artifacts:{...artifacts,srm:{state:'DATA_UNAVAILABLE'}},surfaces}),/SRM_REQUIRED/);
  const manifest=buildPublicManifestV3({sourceVersion:'drive-v1',artifacts,surfaces:{...surfaces,observatory:{state:'DATA_UNAVAILABLE'}}});
  assert.equal(manifest.surfaces.observatory.state,'DATA_UNAVAILABLE');
});
