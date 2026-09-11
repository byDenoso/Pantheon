import { createApi } from '../../lib/atlas-api.mjs';

type SearchApi={
 graph:(query:Record<string,unknown>)=>Promise<any>;
 learning:()=>Promise<any>;ops:()=>Promise<any>;automationRuns:()=>Promise<any>;audit:()=>Promise<any>;
};
const value=<T>(item:PromiseSettledResult<T>):T|null=>item.status==='fulfilled'?item.value:null;

export async function loadGlobalSearchSources(query:string,api:SearchApi=createApi() as SearchApi){
 const q=String(query||'').trim();
 if(!q)return {science:null,olympus:null,learning:null,ops:null,runs:null,audit:null};
 const settled=await Promise.allSettled([
  api.graph({focus:'system:SCIENCE',mode:'search',query:q,limit:8}),
  api.graph({focus:'system:OLYMPUS',mode:'search',query:q,limit:8}),
  api.learning(),api.ops(),api.automationRuns(),api.audit()
 ]);
 return {
  science:value(settled[0]),olympus:value(settled[1]),learning:value(settled[2]),
  ops:value(settled[3]),runs:value(settled[4]),audit:value(settled[5])
 };
}
