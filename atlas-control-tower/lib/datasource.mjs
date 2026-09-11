import {SOURCES,FRESHNESS} from './graph-contract.mjs';
export const MODES=Object.freeze({DRIVE:'drive'});
export const configuredMode=()=>MODES.DRIVE;
export const v1BaseUrl=()=>'';
export const v1Staging=()=>false;
export function createV1Reader(){return{health:{ok:false,detail:'RETIRED_RUNTIME'},checkHealth:async()=>({ok:false,detail:'RETIRED_RUNTIME'})}}
export async function resolveSource(){return{source:SOURCES.DRIVE,freshness:FRESHNESS.SNAPSHOT,mode:MODES.DRIVE,reason:'DRIVE_DERIVED_PROJECTION',usedFallback:false,authority:'GOOGLE_DRIVE',projectionOnly:true}}
export function fallbackIssue(){return null}
