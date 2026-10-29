import {useEffect,useState} from 'react';
import type {SystemState} from '../contracts/system.ts';
import type {Lab,TestEntity} from '../features/lab/model.ts';
import type {Lang} from '../i18n/state-language.ts';
import type {TestRecordReader} from './test-records.ts';
import {TestDetail} from './Views.tsx';
import {WORKSPACE_COPY} from './copy.ts';
/** Complete canonical records are read only when their page is opened. */
export default function OnDemandTestDetail({test,lab,state,lang,refresh,reader}:{test:TestEntity;lab:Lab;state:SystemState;lang:Lang;refresh?:()=>Promise<void>;reader:TestRecordReader}){
  const m=WORKSPACE_COPY[lang],needed=Boolean((state as unknown as {workspace_lab?:unknown}).workspace_lab);
  const [loaded,setLoaded]=useState<SystemState|null>(needed?null:state),[failure,setFailure]=useState<'stale'|'unavailable'|null>(null),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!needed)return;
    const controller=new AbortController();setLoaded(null);setFailure(null);
    void reader.read(test.id,controller.signal).then(record=>{
      if(controller.signal.aborted)return;
      const readModel=(state as unknown as {read_model:Record<string,unknown>}).read_model;
      setLoaded({...state,read_model:{...readModel,tests:{[test.id]:record}}} as SystemState);
    }).catch(error=>{if(!controller.signal.aborted)setFailure(error?.status===409?'stale':'unavailable');});
    return()=>controller.abort();
  },[needed,state,test.id,retry,reader]);
  if(!needed||loaded)return <TestDetail test={test} lab={lab} state={loaded??state} lang={lang}/>;
  return <main className="pw-page"><header className="pw-page-title"><h1 data-private-heading tabIndex={-1}>{test.name}</h1></header>
    <p role={failure?'alert':'status'} aria-busy={!failure}>{failure==='stale'?m.detailStale:failure?m.detailUnavailable:m.detailLoading}</p>
    {failure==='stale'&&refresh?<button className="pw-button" type="button" onClick={()=>void refresh().catch(()=>setFailure('unavailable'))}>{m.reload}</button>:failure&&<button className="pw-button" type="button" onClick={()=>setRetry(value=>value+1)}>{m.tryAgain}</button>}
  </main>;
}
