import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPublicManifest,validatePublicManifest} from '../lib/public-surface-manifest.mjs';

const ready=(name,fill='a')=>({state:'READY',contract:`${name}-v1`,path:`surfaces/${name}/index.json`,sha256:fill.repeat(64)});
const base=overrides=>({
 authority:'GOOGLE_DRIVE',sourceVersion:'2026-09-14T12:00:00Z',generatedAt:'2026-09-14T12:10:00Z',
 surfaces:{graph:ready('graph'),observatory:ready('observatory','b'),laboratory:{state:'DATA_UNAVAILABLE'},...overrides}
});

test('manifest v2 is deterministic over source version plus surface states and hashes',()=>{
 const first=buildPublicManifest(base());
 const second=buildPublicManifest({...base(),generatedAt:'2026-09-14T13:10:00Z'});
 assert.equal(first.contract,'NEXO_ATLAS_PUBLIC_MANIFEST_V2');
 assert.equal(first.authority,'GOOGLE_DRIVE');
 assert.equal(first.projectionOnly,true);
 assert.equal(first.access,'PUBLIC_SANITIZED');
 assert.match(first.fingerprint,/^sha256:[a-f0-9]{64}$/);
 assert.equal(first.fingerprint,second.fingerprint,'generatedAt must not change semantic fingerprint');
 assert.deepEqual(validatePublicManifest(first),first);
});

test('surface state is part of semantic fingerprint, including READY to DATA_UNAVAILABLE',()=>{
 const available=buildPublicManifest(base({activity:ready('activity','c')}));
 const unavailable=buildPublicManifest(base({activity:{state:'DATA_UNAVAILABLE'}}));
 assert.notEqual(available.fingerprint,unavailable.fingerprint);
});

test('READY surfaces require contract path and a raw sha256 hex digest',()=>{
 const manifest=buildPublicManifest(base());
 manifest.surfaces.observatory={state:'READY'};
 assert.throws(()=>validatePublicManifest(manifest),/SURFACE_DESCRIPTOR_INVALID:observatory/);
 manifest.surfaces.observatory={state:'READY',contract:'observatory-v1',path:'surfaces/observatory/index.json',sha256:'short'};
 assert.throws(()=>validatePublicManifest(manifest),/SURFACE_DESCRIPTOR_INVALID:observatory/);
});

test('DATA_UNAVAILABLE is explicit and cannot carry stale payload pointers',()=>{
 const manifest=buildPublicManifest(base());
 manifest.surfaces.laboratory={state:'DATA_UNAVAILABLE',path:'surfaces/laboratory/index.json',sha256:'d'.repeat(64)};
 assert.throws(()=>validatePublicManifest(manifest),/SURFACE_DESCRIPTOR_INVALID:laboratory/);
});

test('graph is the required structural surface while optional surfaces may be unavailable',()=>{
 const manifest=buildPublicManifest(base());
 delete manifest.surfaces.graph;
 assert.throws(()=>validatePublicManifest(manifest),/PUBLIC_MANIFEST_GRAPH_REQUIRED/);
 const valid=buildPublicManifest({authority:'GOOGLE_DRIVE',sourceVersion:'v1',generatedAt:'now',surfaces:{graph:ready('graph'),activity:{state:'DATA_UNAVAILABLE'},learning:{state:'DATA_UNAVAILABLE'}}});
 assert.equal(validatePublicManifest(valid).surfaces.activity.state,'DATA_UNAVAILABLE');
});
