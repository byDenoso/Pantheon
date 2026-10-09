import {createOperationsHandler} from './atlas/operations-route.mjs';
import {atlasBoundary} from './atlas/boundary.mjs';
import {googleToken} from './adapters/google.mjs';
import {googleRuntimeEnvironment} from './adapters/connect.mjs';
import {readVerifiedCanonicalTower} from './mcp/operational-state.mjs';
export default createOperationsHandler({boundary:atlasBoundary,tokenProvider:googleToken,
  runtimeEnvironment:googleRuntimeEnvironment,readTower:readVerifiedCanonicalTower});
