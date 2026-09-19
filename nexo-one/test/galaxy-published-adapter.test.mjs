import test from 'node:test';
import assert from 'node:assert/strict';
import { compileGalaxySnapshot } from '../src/viewmodels/galaxyCompiler.ts';
import {
  normalizePublishedGalaxySnapshot,
  assertGalaxySnapshot,
  galaxySnapshotFreshness,
} from '../src/data/galaxySnapshot.ts';
import { selectCompatibleGalaxySnapshot } from '../src/data/useGalaxySnapshot.ts';
import { scenarioById } from '../src/data/fixtures/scenarios.ts';

function fallbackSnapshot(){
  return compileGalaxySnapshot(scenarioById('all-live').build());
}

test('normalizes the Tower-native published Galaxy V1 into the UI contract without changing canonical entity ids',()=>{
  const fallback=fallbackSnapshot();
  const base=fallback.entities.find(entity=>entity.kind!=='DOMAIN')??fallback.entities[0];
  const raw={
    contract:'NEXO_ONE_GALAXY_V1',
    snapshot_id:'galaxy-abcdef123456-0123456789ab',
    generated_at:fallback.generated_at,
    tower_revision:'a'.repeat(40),
    fingerprint:'sha256:'+'b'.repeat(64),
    provenance:{
      authority:'TOWER_V06',
      source_fingerprint:fallback.tower_revision,
    },
    domains:[
      {domain:'NEXO'},{domain:'SCIENCE'},{domain:'ENGINEERING'},{domain:'OLYMPUS'},
    ],
    subdomains:[],
    entities:[{
      id:`test:${base.id}`,
      canonical_id:base.id,
      kind:base.kind,
      domain:base.domain,
      visual_domain:base.domain,
      status:base.status,
      title:base.title,
      importance:.73,
      layout:{x:12,y:-7,z:3},
      source:{canonical_id:base.id,projection_fingerprint:fallback.tower_revision},
    }],
    relations:[],
    needs_you:[],
    changes:[{
      timestamp:fallback.generated_at,
      entity:`test:${base.id}`,
      change_type:'UPDATED',
      summary:'entity updated',
      before:{status:'READY'},
      after:{status:'RUNNING'},
      importance:.8,
    }],
  };

  const normalized=normalizePublishedGalaxySnapshot(raw,fallback);
  assert.equal(normalized.contract,'NEXO_ONE_GALAXY_V1');
  assert.equal(normalized.snapshot_id,raw.snapshot_id);
  assert.equal(normalized.tower_revision,fallback.tower_revision);
  assert.deepEqual(normalized.domains,['NEXO','SCIENCE','ENGINEERING','OLYMPUS']);
  assert.equal(normalized.entities[0].id,base.id);
  assert.deepEqual(normalized.entities[0].layout.position,{x:12,y:-7,z:3});
  assert.equal(normalized.changes[0].entity_id,base.id);
  assert.equal(normalized.changes[0].change_type,'STATUS_CHANGED');
  assert.equal(selectCompatibleGalaxySnapshot(normalized,fallback,fallback.tower_revision),normalized);
});

test('published snapshot with a different projection fingerprint fails closed to current SystemState fallback',()=>{
  const fallback=fallbackSnapshot();
  const published={...fallback,tower_revision:'sha256:'+'f'.repeat(64)};
  assert.equal(selectCompatibleGalaxySnapshot(published,fallback,fallback.tower_revision),fallback);
});

test('snapshot validator accepts production ids containing the Tower commit segment',()=>{
  const fallback=fallbackSnapshot();
  assert.doesNotThrow(()=>assertGalaxySnapshot({
    ...fallback,
    snapshot_id:'galaxy-abcdef123456-0123456789ab',
  }));
});

test('freshness remains a presentation signal rather than an authority switch',()=>{
  const now=Date.parse('2026-09-19T18:00:00Z');
  assert.equal(galaxySnapshotFreshness('2026-09-19T16:00:00Z',now),'FRESH');
  assert.equal(galaxySnapshotFreshness('2026-09-19T14:00:00Z',now),'AGING');
  assert.equal(galaxySnapshotFreshness('2026-09-19T10:00:00Z',now),'STALE');
});
