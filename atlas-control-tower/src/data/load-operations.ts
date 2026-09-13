import { createConfiguredApi } from '../api/client';

type OpsApi={ops:()=>Promise<any>;automationRuns:()=>Promise<any>;health:()=>Promise<any>};
const safe=async<T>(fn:()=>Promise<T>):Promise<T|null>=>{try{return await fn()}catch{return null}};

export async function loadOperationsSources(api:OpsApi=createConfiguredApi() as OpsApi){
 const [ops,runs,health]=await Promise.all([
  safe(()=>api.ops()),
  safe(()=>api.automationRuns()),
  safe(()=>api.health()),
 ]);
 return {ops,runs,health};
}
