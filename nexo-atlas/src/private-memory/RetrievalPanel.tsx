import {useEffect, useRef, useState, type FormEvent, type ReactNode} from 'react';
import {describeState, type Lang} from '../i18n/state-language.ts';
import {parseToFrame, trusted} from '../private-legacy/protocol.ts';
import {createRetrievalLifetime, refreshRetrievalIndex, parseRetrievalResult, type IndexProgress, type RetrievalRead, type RetrievalRequest, type RetrievalResult, type RetrievalSync} from './retrieval.ts';
import {RETRIEVAL_COPY} from './retrieval-copy.ts';
import './memory.css';

const printable = (v: unknown): string => typeof v === 'string' ? v : JSON.stringify(v, null, 2) ?? '';
const modeName = (mode: string, lang: Lang) => {const m = RETRIEVAL_COPY[lang]; return mode === 'auto' ? m.auto : mode === 'exact' ? m.exact : mode === 'lexical' ? m.lexical : m.graph;};
/** Text and source locators are data, never HTML, executable instructions or external URLs. */
export function RetrievalEvidence({result, request, lang}:{result:RetrievalResult; request:RetrievalRequest; lang:Lang}) {
  const m = RETRIEVAL_COPY[lang];
  const reason = request.mode !== 'auto'
    ? lang === 'en' ? 'Explicitly selected for this query.' : 'Escolhido explicitamente nesta consulta.'
    : (m.reasons as Record<string,string>)[result.route?.reason ?? ''] ?? result.route?.reason;
  return <section className="pr-evidence" aria-labelledby="pr-results-title">
    <h2 id="pr-results-title">{m.results} <span>({result.hits.length})</span></h2>
    <p className="pw-muted">{m.caveat}</p>
    <dl className="pw-pairs pr-query-summary"><div><dt>{m.question}</dt><dd className="pr-source-text">{result.query}</dd></div><div><dt>{m.effective}</dt><dd>{modeName(result.mode,lang)}</dd></div>{reason && <div><dt>{m.reason}</dt><dd>{reason}</dd></div>}</dl>
    {result.answer_status === 'NO_EVIDENCE_IN_AUTHORIZED_INDEX' && <p className="pw-empty" role="status">{m.empty}</p>}
    {result.graph_summary?.truncated === true && <p className="pm-notice" role="status">{m.graphLimit}</p>}
    <ol className="pr-results">{result.hits.map((hit,index) => {
      const state = describeState(hit.state,lang);
      return <li key={hit.id}><article aria-labelledby={`pr-hit-${index}`}>
        <p className="pw-path">{hit.kind} · {hit.id}</p><h3 id={`pr-hit-${index}`}>{hit.title}</h3>
        <dl className="pw-states"><div><dt>{m.state}</dt><dd>{state.known ? state.label : hit.state}</dd></div></dl>
        <h4>{m.original}</h4><p className="pr-source-text">{hit.excerpt}</p>
        {hit.truncated_source && <p className="pw-absent">{m.shortened}</p>}
        <details className="pr-detail" open><summary>{m.citation}</summary><dl className="pw-pairs">{Object.entries(hit.citation).map(([key,value]) => <div key={key}><dt>{(m.cite as Record<string,string>)[key] ?? key}</dt><dd className="pw-code pr-source-text">{printable(value)}</dd></div>)}</dl></details>
        <details className="pr-detail"><summary>{m.context}</summary><pre className="pr-source-text">{printable({chunk_context:hit.chunk_context,segments:hit.segments})}</pre></details>
        {hit.graph_path != null && <details className="pr-detail"><summary>{m.graph}</summary><p className="pw-muted">{m.graphMeaning}</p><pre className="pr-source-text">{printable(hit.graph_path)}</pre></details>}
      </article></li>;
    })}</ol>
    <details className="pr-detail"><summary>{m.technical}</summary><dl className="pw-pairs"><div><dt>{m.requested}</dt><dd>{modeName(request.mode,lang)}</dd></div><div><dt>{m.role}</dt><dd>{result.role}</dd></div><div><dt>{m.method}</dt><dd>{result.method}</dd></div><div><dt>{m.snapshot}</dt><dd className="pw-code">{result.snapshot.revision}</dd></div><div><dt>{m.observed}</dt><dd>{result.snapshot.observed_at}</dd></div></dl><pre className="pr-source-text">{printable({route:result.route,graph_summary:result.graph_summary})}</pre></details>
  </section>;
}

type Notice = '' | 'stale' | 'unauthorized' | 'unsupported' | 'invalid' | 'graphRequired' | 'unavailable' | 'error' | 'synced' | 'syncCanceled' | 'canceled' | 'syncUnavailable';
export function retrievalFailure(error: unknown, syncing = false): Notice {
  const e = error as {status?:number;message?:string};
  if (e?.status === 401 || e?.status === 403 || e?.message === 'AUTH_REQUIRED') return 'unauthorized';
  if (e?.status === 409) return 'stale';
  if (e?.message === 'HISTORICAL_QUERY_UNSUPPORTED') return 'unsupported';
  if (e?.message === 'GRAPH_ENTITY_REQUIRED') return 'graphRequired';
  if (e?.status === 400 || e?.message === 'RETRIEVAL_REQUEST_INVALID') return 'invalid';
  if (e?.message === 'RETRIEVAL_RESPONSE_INVALID') return 'error';
  return syncing ? 'syncUnavailable' : 'unavailable';
}

export default function RetrievalPanel({lang,read,sync,onUnauthorized,bridge}:{lang:Lang;read:RetrievalRead;sync:RetrievalSync;onUnauthorized:()=>void;bridge?:ReactNode}) {
  const m = RETRIEVAL_COPY[lang];
  const [query,setQuery] = useState(''), [mode,setMode] = useState<RetrievalRequest['mode']>('auto'), [limit,setLimit] = useState(8);
  const [result,setResult] = useState<RetrievalResult|null>(null), [submitted,setSubmitted] = useState<RetrievalRequest|null>(null);
  const [busy,setBusy] = useState<'search'|'sync'|null>(null), [notice,setNotice] = useState<Notice>(''), [progress,setProgress] = useState<IndexProgress|null>(null), [closed,setClosed] = useState(false);
  const lifetime = useRef(createRetrievalLifetime()), active = useRef(false), lastRequest = useRef<RetrievalRequest|null>(null), heading = useRef<HTMLHeadingElement|null>(null);
  useEffect(() => {
    // Recreated on mount (including StrictMode's setup/cleanup probe), never shared across sessions.
    lifetime.current = createRetrievalLifetime();
    const close = () => {lifetime.current.close(); active.current=false; lastRequest.current=null;setQuery('');setSubmitted(null);setResult(null);setProgress(null);setBusy(null);setClosed(true);setNotice('unauthorized');};
    const receive = (event:MessageEvent) => {if (trusted(event,window.location.origin,window.parent) && parseToFrame(event.data)?.type === 'TEARDOWN') close();};
    window.addEventListener('message',receive);window.addEventListener('pagehide',close);
    return () => {lifetime.current.close();active.current=false;lastRequest.current=null;window.removeEventListener('message',receive);window.removeEventListener('pagehide',close);};
  },[]);
  const fail = (error:unknown, syncing:boolean) => {
    const failure = retrievalFailure(error,syncing);setResult(null);setProgress(null);setNotice(failure);
    if (failure === 'unauthorized') {lifetime.current.close();lastRequest.current=null;setQuery('');setSubmitted(null);setBusy(null);setClosed(true);active.current=false;onUnauthorized();}
  };
  const search = async (request:RetrievalRequest, operation:ReturnType<ReturnType<typeof createRetrievalLifetime>['start']>) => {
    const value = await read(request,operation.signal);
    if (!operation.current()) return;
    const parsed = parseRetrievalResult(value);setSubmitted(request);setResult(parsed);setNotice('');
  };
  const submit = async (event:FormEvent) => {
    event.preventDefault();if (active.current || closed || !query.trim()) return;
    active.current=true;const operation=lifetime.current.start();const request={query,mode,k:limit};lastRequest.current=request;
    setBusy('search');setNotice('');setResult(null);setProgress(null);
    try {await search(request,operation);}
    catch(error) {if(operation.current())fail(error,false);}
    finally {if(operation.current()){active.current=false;setBusy(null);}}
  };
  const refresh = async () => {
    if(active.current || closed)return;
    active.current=true;const operation=lifetime.current.start();setBusy('sync');setNotice('');setResult(null);setProgress(null);
    let syncing=true;
    try {
      if(!await refreshRetrievalIndex(sync,operation,setProgress) || !operation.current())return;
      setNotice('synced');syncing=false;
      if(lastRequest.current){setBusy('search');await search(lastRequest.current,operation);}
    } catch(error) {if(operation.current())fail(error,syncing);}
    finally {if(operation.current()){active.current=false;setBusy(null);}}
  };
  const cancel = () => {lifetime.current.cancel();active.current=false;setBusy(null);setProgress(null);setResult(null);setNotice(busy==='sync'?'syncCanceled':'canceled');};
  useEffect(() => {if(result)heading.current?.focus({preventScroll:true});},[result]);
  return <main className="pw-page pm pr" aria-busy={!!busy}>
    <header className="pw-page-title"><p className="pw-trail">NEXO · {m.eyebrow}</p><h1 data-private-heading tabIndex={-1}>{m.title}</h1><p className="pw-lead">{m.lead}</p><p className="pw-muted">{m.scope}</p></header>
    <form role="search" className="pr-form" onSubmit={submit} aria-label={m.findView}>
      <label className="pr-question">{m.label}<textarea value={query} onChange={event=>setQuery(event.target.value)} placeholder={m.placeholder} rows={3} maxLength={4000} required disabled={closed} aria-describedby="pr-mode-help"/></label>
      <div className="pr-options"><label>{m.mode}<select value={mode} onChange={event=>setMode(event.target.value as RetrievalRequest['mode'])} disabled={closed}><option value="auto">{m.auto}</option><option value="exact">{m.exact}</option><option value="lexical">{m.lexical}</option></select></label><label>{m.limit}<select value={limit} onChange={event=>setLimit(Number(event.target.value))} disabled={closed}>{[8,20,50].map(n=><option key={n} value={n}>{n}</option>)}</select></label></div>
      <p className="pw-muted" id="pr-mode-help">{m.modeHelp}</p><div className="pm-actions"><button className="pw-button" disabled={!!busy || closed || !query.trim()}>{m.search}</button>{busy && <button type="button" className="pw-button" onClick={cancel}>{m.cancel}</button>}</div>
    </form>
    <div className="pm-live" aria-live="polite" aria-atomic="true">
      {busy && <p role="status">{busy==='sync'?m.syncing:m.searching}</p>}
      {notice && <p className="pm-notice" role={['synced','canceled','syncCanceled'].includes(notice)?'status':'alert'}>{m[notice]}</p>}
    </div>
    {result && submitted ? <><h2 ref={heading} tabIndex={-1} className="pw-sr">{m.results}</h2><RetrievalEvidence result={result} request={submitted} lang={lang}/></> : !busy && !notice && <p className="pw-empty">{m.start}</p>}
    <section className="pr-refresh" aria-label={m.sync}><button type="button" className="pw-button" disabled={!!busy || closed} onClick={()=>void refresh()}>{m.sync}</button><p className="pw-muted">{m.syncHelp}</p>{lastRequest.current && <p className="pw-muted">{m.retry}</p>}
      {progress && <dl className="pw-pairs" aria-label={m.progress} aria-live="polite">{(['staged_shards','verified_shards','documents','chunks'] as const).map(key => progress[key] === undefined ? null : <div key={key}><dt>{m[({staged_shards:'staged',verified_shards:'verified',documents:'documents',chunks:'chunks'} as const)[key]]}</dt><dd>{progress[key]}</dd></div>)}</dl>}
    </section>
    {bridge && <section className="pm-bridge" aria-label={m.bridge}>{bridge}</section>}
  </main>;
}
