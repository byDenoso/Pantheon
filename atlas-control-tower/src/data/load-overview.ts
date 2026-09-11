import {createApi} from '../../lib/atlas-api.mjs';
type OverviewSourceSet={state:unknown|null;ops:unknown|null;audit:unknown|null};
type Api={state:(q?:Record<string,unknown>)=>Promise<unknown>;ops:()=>Promise<unknown>;audit:()=>Promise<unknown>};
const safe=async<T>(fn:()=>Promise<T>):Promise<T|null>=>{try{return await fn()}catch{return null}};
export async function loadOverviewSources(api:Api=createApi() as Api):Promise<OverviewSourceSet>{
 const [state,ops,audit]=await Promise.all([safe(()=>api.state({})),safe(()=>api.ops()),safe(()=>api.audit())]);
 return {state,ops,audit};
}
