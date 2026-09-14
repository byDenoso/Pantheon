import {SOURCES,FRESHNESS} from './graph-contract.mjs';
export const MODES=Object.freeze({TOWER:'tower',DRIVE:'drive'});
export const configuredMode=()=>MODES.TOWER;
export const v1BaseUrl=()=>'';
export const v1Staging=()=>false;
export function createV1Reader(){return{health:{ok:false,detail:'RETIRED_RUNTIME'},checkHealth:async()=>({ok:false,detail:'RETIRED_RUNTIME'})}}
export async function resolveSource(){return{source:SOURCES.TOWER,freshness:FRESHNESS.SNAPSHOT,mode:MODES.TOWER,reason:'TOWER_V06_AUTHORITY_READ_ONLY_PROJECTION',usedFallback:false,authority:'TOWER_V06',truthOwner:'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06',projectionOnly:true}}
export function fallbackIssue(){return null}
