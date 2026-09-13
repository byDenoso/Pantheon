import {createSpatialSession} from './graph-session-v2.mjs';

/** Public graph-session facade. Backend reads remain the truth owner; this layer owns
 * only reversible UI/session state such as navigationStack and navigationIndex. */
export function createSession(api,options={}){
  return createSpatialSession(api,options);
}

export const graphSessionCapabilities=[
  'navigationStack','navigationIndex','forward()','pin(id)','toggleCompare(id)','setSceneState(patch)'
];
