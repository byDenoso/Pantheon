import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapabilitySemanticSurface} from '../lib/capability-semantic-surface.mjs';

const probe={capability_id:'nexo.capability.reconciliation_probe',version:'1.0.0',input_schema:['nonce'],effect_schema:['echo'],side_effect_class:'READ',acceptance_criteria:['echo_matches'],provider:'probe-provider',implementation_ref:'test/probe'};

test('probe is discovered as NEW and visible from a second semantic surface after canonical reconciliation',async()=>{
  let manifest={schema_version:'0.7',capabilities:{}};
  const gateway={readCapabilityManifest:async()=>manifest};
  const chatSurface=createCapabilitySemanticSurface({towerGateway:gateway});
  const otherSurface=createCapabilitySemanticSurface({towerGateway:gateway});

  const candidate=await chatSurface.reconcileCapability(probe);
  assert.equal(candidate.classification,'NEW');
  assert.equal(candidate.trusted,false);

  manifest={...manifest,capabilities:{...manifest.capabilities,[probe.capability_id]:{...candidate.candidate,status:'CANDIDATE'}}};
  const readback=await otherSurface.getCapabilities();
  assert.ok(readback.capabilities[probe.capability_id]);
  assert.equal(readback.authority,'TOWER_V06/manifests/capabilities.json');

  const drift=await otherSurface.getCapabilityDrift([]);
  assert.equal(drift.find(item=>item.capability_id===probe.capability_id)?.state,'STALE');
});
