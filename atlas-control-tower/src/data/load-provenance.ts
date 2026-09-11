import { createApi } from '../../lib/atlas-api.mjs';

type ProvenanceApi={audit:()=>Promise<any>;lineage:(id:string)=>Promise<any>};
const safe=async<T>(fn:()=>Promise<T>):Promise<T|null>=>{try{return await fn()}catch{return null}};

export async function loadProvenanceSources(api:ProvenanceApi=createApi() as ProvenanceApi,focusId=''){
 const auditPromise=safe(()=>api.audit());
 const lineagePromise=focusId?safe(()=>api.lineage(focusId)):Promise.resolve(null);
 const [audit,lineage]=await Promise.all([auditPromise,lineagePromise]);
 return {audit,lineage};
}
