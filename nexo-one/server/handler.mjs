// Existing routes delegate unchanged, including every public and machine boundary.
import coreHandler from './handler-core.mjs';
import {OPERATIONS_ROUTES,operationsRoute,createOperationsHandler} from './atlas/operations-route.mjs';
import {atlasBoundary} from './atlas/boundary.mjs';
import {googleToken} from './adapters/google.mjs';
import {googleRuntimeEnvironment} from './adapters/connect.mjs';
import {readVerifiedCanonicalTower} from './mcp/operational-state.mjs';
const handleOperations=createOperationsHandler({boundary:atlasBoundary,tokenProvider:googleToken,
  runtimeEnvironment:googleRuntimeEnvironment,readTower:readVerifiedCanonicalTower});
export default function handler(req,res) {
  return OPERATIONS_ROUTES.has(operationsRoute(req)) ? handleOperations(req,res) : coreHandler(req,res);
}
