import type {RuntimeHolder} from '../private-legacy/runtime.ts';
export type TestRecord = Record<string,unknown>;
export type TestRecordReader = {read(id:string,signal?:AbortSignal):Promise<TestRecord>; clear():void};
const fail=(code:string,status=0)=>Object.assign(new Error(code),{status});
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
/** Fixed, owner+PIN-authenticated route. Cache lives only in this frame's runtime generation. */
export function createTestRecordReader(nativeFetch:typeof fetch,holder:RuntimeHolder,onUnauthorized:()=>void):TestRecordReader {
  const cache=new Map<string,TestRecord>();let lifetime=new AbortController();
  const clear=()=>{lifetime.abort();lifetime=new AbortController();cache.clear();};
  holder.onChange(clear);
  return {clear,async read(id,signal){
    const runtime=holder.get(),generation=holder.generation(),revision=runtime?.source_revision;
    if(!runtime||!revision)throw fail('AUTH_REQUIRED',401);
    if(typeof id!=='string'||!id.trim()||id.length>512)throw fail('PRIVATE_TEST_REQUEST_INVALID',400);
    const combined=signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal;
    combined.throwIfAborted();
    if(cache.has(id))return cache.get(id)!;
    try {
      const response=await nativeFetch('/api/atlas-private/test',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({id,expected_revision:revision}),signal:combined});
      if(response.redirected || !(response.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))throw fail('PRIVATE_TEST_RESPONSE_INVALID',response.status);
      const value:unknown=await response.json();
      if(!response.ok)throw fail(object(value)&&typeof value.error==='string'?value.error:'PRIVATE_TEST_UNAVAILABLE',response.status);
      combined.throwIfAborted();
      if(holder.generation()!==generation||holder.get()!==runtime)throw fail('SOURCE_REVISION_CHANGED',409);
      if(!object(value)||value.contract!=='ATLAS_PRIVATE_TEST_V1'||value.access!=='PRIVATE'||value.id!==id||value.source_revision!==revision||!object(value.record)||value.record.id!==id)throw fail('PRIVATE_TEST_RESPONSE_INVALID');
      if(cache.size>=8)cache.delete(cache.keys().next().value!);
      cache.set(id,value.record);return value.record;
    }catch(error){if((error as {status?:number}).status===401){clear();onUnauthorized();}throw error;}
  }};
}
