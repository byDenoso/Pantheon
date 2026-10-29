// Local test entry only. Never used in the production Worker build.
import {createWorker} from '../worker/index.mjs';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
export default createWorker({readSource: async env => {
  const response = await env.TOWER_TEST.fetch('https://canonical-test.invalid/source');
  return compilePrivateTowerRuntime(await response.json());
}});
