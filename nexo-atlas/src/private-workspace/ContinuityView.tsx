import {useEffect, useRef, useState} from 'react';
import {continuityTransport} from '../private-legacy/install.ts';
import {testHref} from './model.ts';
import type {ContinuityData, ContinuityMemory} from './continuity.ts';
import {CONTINUITY_COPY} from './continuity-copy.ts';
import type {Lang} from '../i18n/state-language.ts';
import {DateText, EvidenceText} from './Value.tsx';
import {displayJson} from './blob.ts';

const CATEGORIES = ['USER_PREFERENCE','USER_DECISION','PROJECT_CONTEXT','SCIENTIFIC_EVIDENCE','OPERATIONAL_LESSON'];
const printable = (value: unknown) => JSON.stringify(value, null, 2);
const label = (labels: Record<string,string>, key: string) => labels[key] ?? key;
/** datetime-local uses local wall time, so its maximum must use the same timezone. */
export const localDateTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0,16);

function MemoryProposal({scope, correction, close, lang}: {scope: string; correction: ContinuityMemory | null; close: () => void; lang: Lang}) {
  const m = CONTINUITY_COPY[lang];
  const [text,setText]=useState(correction?.text ?? ''),[category,setCategory]=useState(correction?.category ?? 'USER_PREFERENCE'),[proposal,setProposal]=useState('');
  const prepare = () => {
    if(!text.trim())return;
    const created_at=new Date().toISOString(),event_id='atlas-memory-'+crypto.randomUUID();
    setProposal(printable({kind:'NEXO_MEMORY_ENTRY',source:'ATLAS_OWNER',intent_id:event_id,created_at,payload:{event_id,scope,category,text:text.trim(),sources:correction?.sources ?? [],...(correction?{supersedes_record_id:correction.id,applicability:correction.applicability ?? m.correctionLimits}:{})}}));
  };
  const needsSource=['SCIENTIFIC_EVIDENCE','OPERATIONAL_LESSON'].includes(category)&&!correction?.sources.length;
  return <section className="pw-outline pw-continuity-proposal"><h2>{correction?m.correction:m.prepareMemory}</h2>
    <p className="pw-muted">{m.proposalLead}</p>
    <label>{m.type}<select value={category} disabled={Boolean(correction)} onChange={e=>{setCategory(e.target.value);setProposal('');}}>{CATEGORIES.map(c=><option key={c} value={c}>{label(m.labels,c)}</option>)}</select></label>
    <label>{m.record}<textarea rows={4} maxLength={12000} value={text} onChange={e=>{setText(e.target.value);setProposal('');}}/></label>
    {needsSource?<p role="status">{m.needsSource}</p>:null}
    <div className="pw-tools"><button type="button" className="pw-button" disabled={needsSource||!text.trim()} onClick={prepare}>{m.prepareJson}</button><button type="button" className="pw-button" onClick={close}>{m.close}</button></div>
    {proposal?<label>{m.proposal}<textarea readOnly rows={12} value={proposal} onFocus={e=>e.target.select()}/></label>:null}
  </section>;
}

export default function ContinuityView({lang,sourceRevision}: {lang: Lang; sourceRevision?: string}) {
  const m = CONTINUITY_COPY[lang];
  const [scope,setScope]=useState('SCIENCE'),[client,setClient]=useState(''),[clientInput,setClientInput]=useState(''),[since,setSince]=useState(''),[reload,setReload]=useState(0);
  const [data,setData]=useState<ContinuityData|null>(null),[error,setError]=useState<keyof typeof m|null>(null),[loading,setLoading]=useState(false);
  const [events,setEvents]=useState<unknown[]>([]),[next,setNext]=useState<number|null>(0),[historyBusy,setHistoryBusy]=useState(false);
  const [editing,setEditing]=useState<ContinuityMemory|null|undefined>(undefined);
  const generation=useRef(0), historyAbort=useRef<AbortController|null>(null);
  const selectedScope=scope==='CLIENT'?'CLIENT:'+client:scope;
  const selectedDate=since?new Date(since):null;
  const validSince=!selectedDate || (Number.isFinite(selectedDate.getTime()) && selectedDate.getTime()<=Date.now());
  useEffect(()=>{
    const controller=new AbortController();generation.current++;historyAbort.current?.abort();setHistoryBusy(false);setLoading(true);setError(null);setData(null);setEvents([]);setNext(0);setEditing(undefined);
    const date=since?new Date(since):null;
    if(date&&(!Number.isFinite(date.getTime())||date.getTime()>Date.now())){setError('invalidSince');setLoading(false);return ()=>controller.abort();}
    if(scope==='CLIENT'&&!/^[A-Za-z0-9_-]{1,80}$/.test(client)){setLoading(false);return ()=>controller.abort();}
    continuityTransport({scope:selectedScope,view:'overview',...(date?{since:date.toISOString()}:{})},controller.signal)
      .then(value=>{if(!controller.signal.aborted)setData(value);})
      .catch(e=>{if(!controller.signal.aborted)setError(e.status===401?'expired':e.message==='SOURCE_REVISION_CHANGED'?'stale':'unavailable');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>{controller.abort();historyAbort.current?.abort();generation.current++;};
  },[selectedScope,scope,client,since,reload,sourceRevision]);
  const history=async()=>{
    if(!data||next===null||historyBusy)return;
    const requestGeneration=generation.current,controller=new AbortController();historyAbort.current=controller;setHistoryBusy(true);setError(null);
    try{const value=await continuityTransport({scope:selectedScope,view:'board',offset:next,limit:50,expected_revision:data.source_revision},controller.signal);if(controller.signal.aborted||requestGeneration!==generation.current)return;setEvents(old=>[...old,...value.items]);setNext(value.next_offset);}
    catch(e){if(!controller.signal.aborted&&requestGeneration===generation.current)setError((e as {status?:number}).status===409?'historyStale':'historyUnavailable');}
    finally{if(!controller.signal.aborted&&requestGeneration===generation.current)setHistoryBusy(false);if(historyAbort.current===controller)historyAbort.current=null;}
  };
  const nextStep=(value: string|null) => value?.trim() || m.notRecorded;
  return <main className="pw-page pw-continuity" aria-busy={loading}><header className="pw-page-title"><p className="pw-trail">{m.trail}</p><h1 data-private-heading tabIndex={-1}>{m.title}</h1><p className="pw-lead">{m.lead}</p></header>
    <div className="pw-tools pw-continuity-tools"><label>{m.scope}<select value={scope} onChange={e=>setScope(e.target.value)}><option value="SCIENCE">{m.science}</option><option value="WORK">{m.work}</option><option value="PERSONAL">{m.personal}</option><option value="CLIENT">{m.client}</option></select></label>
      {scope==='CLIENT'?<><label>{m.clientId}<input maxLength={80} value={clientInput} onChange={e=>setClientInput(e.target.value)} placeholder={m.clientExample}/></label><button type="button" className="pw-button" disabled={!/^[A-Za-z0-9_-]{1,80}$/.test(clientInput)} onClick={()=>setClient(clientInput)}>{m.openScope}</button></>:null}
      <label>{m.since}<input type="datetime-local" value={since} max={localDateTime(new Date())} aria-invalid={!validSince||undefined} onChange={e=>setSince(e.target.value)}/></label>
      <button type="button" className="pw-button" disabled={loading||!validSince} onClick={()=>setReload(n=>n+1)}>{m.refresh}</button></div>
    {error?<div className="pw-continuity-error"><p role="alert">{String(m[error])}</p>{error!=='invalidSince'&&<button type="button" className="pw-button" disabled={loading} onClick={()=>setReload(n=>n+1)}>{m.tryAgain}</button>}</div>:null}
    {loading?<p className="pw-loading" role="status">{m.loading}</p>:null}
    {scope==='CLIENT'&&!/^[A-Za-z0-9_-]{1,80}$/.test(client)&&<p className="pw-empty" role="status">{m.enterClient}</p>}
    {data?<>
      <p className="pw-quiet">{m.readAt} <DateText value={data.observed_at} lang={lang}/>. {data.source_updated_at&&<>{m.revisionAt} <DateText value={data.source_updated_at} lang={lang}/>.</>}</p>
      <section className="pw-outline"><h2>{m.needsYou}</h2>{data.decisions.length?<ul className="pw-rows">{data.decisions.map(p=><li key={p.id}><h3>{p.title}</h3><p>{p.text}</p><pre className="pw-ref">{displayJson(p.decision,lang)}</pre><p>{m.next}: {nextStep(p.next_action)}</p></li>)}</ul>:<p className="pw-muted">{m.noDecisions}</p>}</section>
      <section className="pw-outline"><h2>{m.deliveries}</h2>{data.deliveries.length?<ul className="pw-rows">{data.deliveries.map(d=><li key={d.id}><h3>{d.title}</h3><p><EvidenceText text={d.text} lang={lang}/></p><details><summary>{m.deliverySource}</summary><pre className="pw-ref">{displayJson({delivery:d.delivery,sources:d.sources,source_revision:data.source_revision},lang)}</pre></details></li>)}</ul>:<p className="pw-muted">{m.noDeliveries}</p>}</section>
      <section className="pw-outline"><h2>{m.projects}</h2>{data.projects.length?<ul className="pw-rows">{data.projects.map(p=><li key={p.id}><h3>{p.title}</h3><p className="pw-facts">{label(m.labels,p.action)} · {p.owner?.trim() || m.noOwner}</p><p>{p.text}</p><p>{m.next}: {nextStep(p.next_action)}</p>{p.depends_on.length?<p className="pw-quiet">{m.dependsOn}: {displayJson(p.depends_on,lang)}</p>:null}<details><summary>{m.projectSources}</summary><pre className="pw-ref">{displayJson(p.history,lang)}</pre></details></li>)}</ul>:<p className="pw-muted">{m.noProjects} <a href="#/teia/operacao">{m.operations}</a>.</p>}</section>
      {selectedScope==='SCIENCE'?<section className="pw-outline"><h2>{m.board}</h2><p className="pw-muted">{m.boardLead}</p>{data.cards.length?<ul className="pw-rows">{data.cards.map(c=><li key={c.scope_id+':'+c.id}><h3>{c.claim}</h3><p className="pw-facts">{c.state} · SPEC {c.spec_version} · {label(m.roles,c.next_owner)}</p><p className="pw-quiet">{m.materialAt}: <DateText value={c.last_material_at} lang={lang}/>{c.stale?` · ${m.followUp}`:''}</p>{c.gaps.length?<p>{m.gaps}: {c.gaps.join(', ')}</p>:null}{c.open_objections.length||c.open_conflicts.length?<p>{c.open_objections.length} {m.objections} · {c.open_conflicts.length} {m.conflicts}.</p>:null}{c.registration?.test_id?<p><a href={testHref(c.registration.test_id)}>{m.openTest} →</a></p>:null}<details><summary>{m.cardSources}</summary><pre className="pw-ref">{displayJson(c,lang)}</pre></details></li>)}</ul>:<p className="pw-muted">{m.noEvents} <a href="#/teia/mural">{m.existingBoard}</a> {m.available}</p>}
        <details><summary>{m.history} · {data.events_total} {m.events}</summary><p className="pw-quiet">{m.sameRevision}</p>{events.map((e,i)=><pre className="pw-ref" key={i}>{displayJson(e,lang)}</pre>)}{next!==null?<button type="button" className="pw-button" disabled={historyBusy} onClick={()=>void history()}>{historyBusy?m.pageLoading:m.nextPage}</button>:<p>{m.historyEnd}</p>}</details></section>:null}
      <section className="pw-outline"><h2>{m.memory}</h2><button type="button" className="pw-button" onClick={()=>setEditing(null)}>{m.prepareRecord}</button>{editing!==undefined?<MemoryProposal key={selectedScope+':'+(editing?.id??'new')} scope={selectedScope} correction={editing} close={()=>setEditing(undefined)} lang={lang}/>:null}{data.memory.length?<ul className="pw-rows">{data.memory.map(r=><li key={r.id}><p className="pw-facts">{label(m.labels,r.category)}</p><p><EvidenceText text={r.text} lang={lang}/></p><p className="pw-quiet">{r.author} · <DateText value={r.recorded_at} lang={lang}/></p>{r.contradicts?.length?<p>{m.tension}</p>:null}<details><summary>{m.origin}</summary><pre className="pw-ref">{displayJson(r,lang)}</pre></details><button type="button" className="pw-button" onClick={()=>setEditing(r)}>{m.correction}</button></li>)}</ul>:<p className="pw-muted">{m.noMemory} <a href="#/teia/memoria">{m.existingSearch}</a> {m.olderRecords}</p>}</section>
      <section className="pw-outline"><h2>{m.timeline}</h2><p className="pw-quiet">{data.timeline_total} {m.changes} {data.timeline_total>100?m.recentLimit:''}</p><ul className="pw-entries">{!data.timeline.length&&<li className="pw-muted">{m.noChanges}</li>}{data.timeline.map(e=><li key={e.id}><p className="pw-facts">{label(m.labels,e.kind)} · <DateText value={e.at} lang={lang}/></p><p>{e.text?.trim() ? <EvidenceText text={e.text} lang={lang}/> : m.seeRecord}</p></li>)}</ul></section>
    </>:null}
  </main>;
}
