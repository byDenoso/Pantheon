import {normalizePrivateTower} from './private-tower-input.mjs';
import {compilePrivateTowerSystem} from './private-tower-system.mjs';
import {compilePrivateTowerWorld} from './private-tower-world.mjs';
import {compilePrivateTowerViews} from './private-tower-views.mjs';
import {validatePrivateRuntime} from './private-runtime.mjs';
// One canonical source object, one revision, no storage/writeback or public
// projection dependency. All outputs are derived in memory for this request.
export function compilePrivateTowerRuntime(tower){
  const context=normalizePrivateTower(tower);
  const system=compilePrivateTowerSystem(context);
  const world=compilePrivateTowerWorld(context);
  const {topology,galaxy}=compilePrivateTowerViews({...context,system});
  const {revision,generatedAt}=context;
  const publication={contract:'NEXO_PRIVATE_PROJECTION_PUBLICATION_V1',access:'PRIVATE',manifest:{authority:'TOWER_V06',access:'PRIVATE',source_storage:'GOOGLE_DRIVE_PRIVATE',truth_owner:tower.truth_owner,source_state_fingerprint:revision,tower_revision:revision,projection_fingerprint:revision,projection_only:true,writeback:'FORBIDDEN',generated_at:generatedAt},build_meta:{contract:'NEXO_ONE_BUILD_META_V1',projection_fingerprint:revision,built_at:generatedAt}};
  return {contract:'ATLAS_PRIVATE_V1',data:validatePrivateRuntime({contract:'NEXO_ATLAS_PRIVATE_RUNTIME_V1',access:'PRIVATE',generated_at:generatedAt,source_revision:revision,fingerprint:revision,system,world,topology,publication,galaxy})};
}
