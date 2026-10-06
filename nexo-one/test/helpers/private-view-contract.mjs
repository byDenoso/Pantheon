// Test helper documenting a PROPOSED integration contract, not production auth.
import assert from 'node:assert/strict';
import {assertSystemState} from '../../src/data/adapters/source.ts';

export const PRIVATE_VIEW_REQUIREMENTS=Object.freeze([
  {surface:'atlas',component:'atlas3d/Atlas3DApp.tsx',legacyRoute:'#/atlas',privateRoute:'#/privado/atlas',fields:['system.graph','system.filaments'],suites:['atlas-graph-core.test.mjs','atlas3d-metro-production.test.mjs']},
  {surface:'lab',component:'features/lab/LabApp.tsx',legacyRoute:'#/agora',privateRoute:'#/privado/agora',fields:['system.read_model','system.science_projection_v1','system.evolution','system.guardian'],suites:['lab-live-state.test.mjs','lab-audit-regressions.test.mjs','lab-presentation-integrity.test.mjs']},
  {surface:'universe',component:'features/lab/UniversePage.tsx',legacyRoute:'#/universo',privateRoute:'#/privado/universo',fields:['system.cosmology_state'],suites:['lab-presentation-integrity.test.mjs']},
  {surface:'operations',component:'features/system/Operations.tsx',legacyRoute:'#/cockpit/pipeline',privateRoute:'#/privado/cockpit/pipeline',fields:['system.actions','system.inbox','system.runs','system.projected_work'],suites:['execution-integrity.test.mjs','incident-operations.test.mjs']},
  {surface:'science',component:'features/ScienceWorkspace.tsx',legacyRoute:'#/cockpit/ciencia',privateRoute:'#/privado/cockpit/ciencia',fields:['system.science_projection_v1','system.filaments'],suites:['science-projection-v1.test.mjs']},
  {surface:'personal',component:'features/PersonalCockpit.tsx',legacyRoute:'#/cockpit/pessoal/context',privateRoute:'#/privado/cockpit/pessoal/context',fields:['world.items','world.contexts','world.providers','world.truthGraph'],suites:['personal-routes.test.mjs']},
  {surface:'topology',component:'mcp/McpAtlasApp.tsx',legacyRoute:'#/sistema',privateRoute:'#/privado/sistema',fields:['topology','publication.manifest','publication.build_meta'],suites:['mcp-atlas-site.test.mjs','shared-json-lifecycle.test.mjs']},
  {surface:'galaxy',component:'atlas3d/GalaxyView.tsx',legacyRoute:'#/galaxia',privateRoute:'#/privado/galaxia',fields:['galaxy'],suites:['atlas-observation.test.mjs','galaxy-server-compiler.test.mjs'],note:'Retained renderer; legacy galaxy route currently aliases agora.'},
]);

export function assertPrivateRuntimeProposal(envelope){
  assert.equal(envelope?.contract,'ATLAS_PRIVATE_V1');
  const runtime=envelope.data;
  assert.equal(runtime?.contract,'NEXO_ATLAS_PRIVATE_RUNTIME_V1');
  assert.equal(runtime.access,'PRIVATE');
  assertSystemState(runtime.system);
  const fp=runtime.system.bus.fingerprint;
  assert.match(fp,/^sha256:[a-f0-9]{64}$/i);
  assert.equal(runtime.fingerprint,fp);
  assert.equal(runtime.world?.version,'1');
  assert.equal(runtime.world.access,'PRIVATE');
  for(const key of ['items','providers','contexts','issues'])assert.ok(Array.isArray(runtime.world[key]),'world.'+key);
  assert.ok(Array.isArray(runtime.world.truthGraph?.results));
  assert.ok(runtime.world.diff);
  for(const row of runtime.world.items){assert.ok(row.id&&row.sourceRef&&row.freshness&&Array.isArray(row.actions));}
  assert.equal(runtime.topology?.access,'PRIVATE');
  assert.ok(Array.isArray(runtime.topology.nodes)&&Array.isArray(runtime.topology.links));
  assert.equal(runtime.topology.source.projection_fingerprint,fp);
  assert.equal(runtime.publication?.contract,'NEXO_PRIVATE_PROJECTION_PUBLICATION_V1');
  assert.equal(runtime.publication.access,'PRIVATE');
  assert.equal(runtime.publication.manifest.projection_fingerprint,fp);
  assert.equal(runtime.publication.build_meta.projection_fingerprint,fp);
  const galaxy=runtime.galaxy;
  assert.equal(galaxy?.contract,'NEXO_ONE_GALAXY_V1');
  assert.equal(galaxy.access,'PRIVATE');
  assert.equal(galaxy.provenance.authority,'TOWER_V06');
  assert.equal(galaxy.provenance.source_fingerprint,fp);
  assert.notEqual(galaxy.provenance.source_contract,'NEXO_PUBLIC_PROJECTION_V1');
  assert.match(galaxy.fingerprint,/^sha256:[a-f0-9]{64}$/i);
  for(const key of ['entities','events','relations','needs_you'])assert.ok(Array.isArray(galaxy[key]),'galaxy.'+key);
  for(const key of ['entities','relations','needs_you'])assert.equal(galaxy.stats[key],galaxy[key].length);
  const ids=new Set();
  for(const entity of galaxy.entities){
    assert.ok(entity.id&&!ids.has(entity.id));ids.add(entity.id);
    assert.ok(['x','y','z'].every(key=>Number.isFinite(entity.layout?.[key])));
    if(entity.source?.projection_fingerprint)assert.equal(entity.source.projection_fingerprint,fp);
    assert.notEqual(entity.observation?.access,'PUBLIC_PROJECTION');
  }
  return runtime;
}
