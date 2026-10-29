import {useEffect, useRef, useState, type FormEvent, type ReactNode} from 'react';
import {describeState, type Lang} from '../i18n/state-language.ts';
import {memoryTransport} from '../private-legacy/install.ts';
import {postToParent, frameMessage} from '../private-legacy/state.ts';
import './memory.css';

type Row = {canonical_id:string; object_id:string; kind:string; title:string; state:string; topic:string; text:string; truncated:boolean; provisional:boolean; feedback:boolean; annotation:boolean;annotation_type?:string;annotation_text?:string;annotation_reason?:string;supersedes?:string; ambiguous_identity?:boolean; refs:string[]; history?:Row[]; history_total?:number; citation:{source_id:string;tower_revision:string;path:string;json_pointer:string;entity_version:string;content_sha256:string;hash_contract:string}};
type Page = {contract:string;access:string;source_revision:string;observed_at:string;total:number;offset:number;next_offset:number|null;kinds:string[];items:Row[]};
type Review = {contract:string;state:string;persisted:boolean;applied:boolean;proposal:Record<string,unknown>;expected_tower_revision:string};
const COPY = {
  'pt-BR': {title:'Histórico e aprendizados',lead:'Consulte as fontes que alimentam a memória do NEXO. Hipóteses, resultados e observações provisórias mantêm seus estados originais.',limit:'Esta visão lê os registros da Tower. Os agrupamentos semânticos e o feedback ainda local do módulo de memória não estão conectados aqui.',search:'Buscar nos registros',query:'Pergunta, título ou identificador',kind:'Tipo de registro',all:'Todos',filter:'Mostrar',provisional:'Provisórios',feedback:'Feedback registrado',annotations:'Anotações humanas',related:'Hipótese ou teste relacionado',find:'Buscar',loading:'Consultando a Tower…',none:'Nenhum registro neste filtro.',open:'Abrir registro',back:'Voltar à lista',source:'Fonte e versão',details:'Texto registrado',edit:'Adicionar anotação ou correção',editLead:'A edição cria uma nova anotação vinculada à fonte. O resultado científico e a evidência histórica são preservados.',type:'Tipo de anotação',note:'Anotação',correction:'Correção de interpretação',decision:'Decisão humana',body:'Sua anotação',reason:'Motivo da alteração',review:'Preparar revisão',cancel:'Cancelar',draft:'Proposta preparada, ainda não salva',blocked:'A gravação no Writer ainda não está conectada a este site. A proposta fica somente nesta sessão; fechar esta visão a descarta.',reviewJson:'Proposta para o Writer existente',conflict:'A fonte mudou. Atualize a lista e revise a anotação antes de tentar novamente.',error:'Não foi possível consultar a memória. Tente novamente.',expired:'Sua sessão terminou. Entre novamente para continuar.',prev:'Página anterior',next:'Próxima página',history:'Histórico de anotações',noHistory:'Nenhuma anotação humana foi registrada para esta fonte.',ambiguous:'Este identificador está em conflito. A edição fica bloqueada até a fonte ser corrigida.',short:'Trecho abreviado. Consulte a fonte para o conteúdo completo.',saved:'Gravação indisponível',revision:'Revisão da Tower',count:'registros',refresh:'Atualizar lista',readonly:'Rascunho local; nenhum dado foi alterado na Tower.',eyebrow:'Memória privada',stateLabel:'Estado registrado',draftBadge:'Rascunho desta sessão',notSaved:'Nada foi gravado. Este rascunho existe só enquanto esta visão estiver aberta.',refs:'Referências registradas',noRefs:'Nenhuma referência registrada para este item.',revise:'Revisar esta anotação',supersedesNote:'Esta anotação substituirá a anterior quando a gravação existir.',page:'Itens',to:'a',of:'de',lineage:'De onde vem',observed:'Consulta feita em',bridge:'Ponte de leitura',cite:{source_id:'Fonte',tower_revision:'Revisão da Tower',path:'Caminho',json_pointer:'Posição no registro',entity_version:'Versão do item',content_sha256:'Hash do conteúdo',hash_contract:'Contrato do hash'}},
  en:{title:'History and learnings',lead:'Browse the sources used by NEXO memory. Hypotheses, results and provisional observations keep their original states.',limit:'This view reads Tower records. Semantic clusters and feedback still held in the local memory module are not connected here.',search:'Search records',query:'Question, title or identifier',kind:'Record type',all:'All',filter:'Show',provisional:'Provisional',feedback:'Recorded feedback',annotations:'Human annotations',related:'Related hypothesis or test',find:'Search',loading:'Reading Tower…',none:'No records match these filters.',open:'Open record',back:'Back to list',source:'Source and version',details:'Recorded text',edit:'Add annotation or correction',editLead:'Edits create a new annotation linked to the source. Scientific results and historical evidence are preserved.',type:'Annotation type',note:'Note',correction:'Interpretation correction',decision:'Human decision',body:'Your annotation',reason:'Reason for change',review:'Prepare review',cancel:'Cancel',draft:'Proposal prepared, not saved yet',blocked:'Writer access is not connected to this site yet. The proposal stays in this session only; closing this view discards it.',reviewJson:'Proposal for the existing Writer',conflict:'The source changed. Refresh the list and review your annotation before trying again.',error:'Memory could not be read. Please try again.',expired:'Your session ended. Sign in again to continue.',prev:'Previous page',next:'Next page',history:'Annotation history',noHistory:'No human annotations have been recorded for this source.',ambiguous:'This identifier is in conflict. Editing stays blocked until its source is corrected.',short:'Shortened excerpt. Read the source for the full content.',saved:'Saving unavailable',revision:'Tower revision',count:'records',refresh:'Refresh list',readonly:'Session draft; no Tower data has changed.',eyebrow:'Private memory',stateLabel:'Recorded state',draftBadge:'Draft of this session',notSaved:'Nothing was saved. This draft exists only while this view stays open.',refs:'Recorded references',noRefs:'No reference recorded for this item.',revise:'Revise this annotation',supersedesNote:'This annotation will replace the previous one once saving exists.',page:'Items',to:'to',of:'of',lineage:'Where it comes from',observed:'Read at',bridge:'Read bridge',cite:{source_id:'Source',tower_revision:'Tower revision',path:'Path',json_pointer:'Position in the record',entity_version:'Item version',content_sha256:'Content hash',hash_contract:'Hash contract'}}
};
const when = (value:string, lang:Lang) => { const at = Date.parse(value); if (!Number.isFinite(at)) return value; try { return new Intl.DateTimeFormat(lang,{dateStyle:'long',timeStyle:'short'}).format(at); } catch { return value; } };
/** the published state said in words when the shared formatter knows it; otherwise exactly as published */
const stateText = (value:string, lang:Lang) => { const state = describeState(value, lang); return state.known ? state.label : value; };
/**
 * Candidate memory view (not live). Read-only browse and an unsaved session draft; there is no persistent write here.
 * `bridge` is a reserved presentation slot for the optional read-only bridge another implementer may mount; nothing is shown without it.
 */
export default function MemoryBrowseView({lang, bridge}:{lang:Lang; bridge?:ReactNode}) {
  const m = COPY[lang], [page,setPage] = useState<Page|null>(null), [selected,setSelected] = useState<Row|null>(null);
  const [query,setQuery] = useState(''), [kind,setKind] = useState('all'), [filter,setFilter] = useState('all'), [related,setRelated] = useState('');
  const [busy,setBusy] = useState(false), [notice,setNotice] = useState(''), [editing,setEditing] = useState(false), [review,setReview] = useState<Review|null>(null);
  const [supersedes,setSupersedes] = useState<string|null>(null);
  const [annotation,setAnnotation] = useState(''), [reason,setReason] = useState(''), [annotationType,setAnnotationType] = useState('NOTE');
  const abort = useRef<AbortController|null>(null), sequence = useRef(0), flight = useRef(false);
  const clearDraft = () => {setEditing(false);setReview(null);setAnnotation('');setReason('');setAnnotationType('NOTE');setSupersedes(null);};
  const failure = (error:unknown) => {
    const e = error as {status?:number;message?:string};
    if (e.status === 401) {setPage(null);setSelected(null);clearDraft();setNotice(m.expired);postToParent(frameMessage.logout());}
    else setNotice(e.status === 409 ? m.conflict : m.error);
  };
  const load = async (offset = 0, expected?:string) => {
    if (flight.current) return;
    flight.current = true; abort.current?.abort(); const controller = new AbortController();abort.current=controller;const id=++sequence.current;
    setBusy(true);setNotice('');setSelected(null);clearDraft();
    try {
      const value:Page = await memoryTransport('browse',{query,kind,status:filter,related_id:related,offset,limit:30,...(expected ? {expected_revision:expected}: {})},controller.signal);
      if (id !== sequence.current || controller.signal.aborted) return;
      if (value.contract !== 'ATLAS_PRIVATE_MEMORY_V1' || value.access !== 'PRIVATE' || !Array.isArray(value.items)) throw new Error('MEMORY_RESPONSE_INVALID');
      setPage(value);
    } catch(e) {if (!controller.signal.aborted && id === sequence.current) {setPage(null);failure(e);}}
    finally {if (id === sequence.current) {flight.current=false;setBusy(false);}}
  };
  useEffect(() => {void load();return () => {++sequence.current;abort.current?.abort();flight.current=false;};},[]);
  const prepare = async (event:FormEvent) => {
    event.preventDefault();if (!selected || !page || flight.current) return;
    flight.current=true;const controller = new AbortController();abort.current=controller;const id=++sequence.current;setBusy(true);setNotice('');setReview(null);
    try {
      const value:Review=await memoryTransport('propose',{target_id:selected.canonical_id,expected_revision:page.source_revision,expected_content_sha256:selected.citation.content_sha256,annotation_type:annotationType,text:annotation,reason,...(supersedes ? {supersedes}: {})},controller.signal);
      if (id!==sequence.current || controller.signal.aborted) return;
      if (value.contract!=='ATLAS_MEMORY_EDIT_REVIEW_V1' || value.state!=='DRAFT' || value.applied!==false || value.persisted!==false) throw Error('MEMORY_RESPONSE_INVALID');
      setReview(value);
    } catch(e) {if(!controller.signal.aborted && id===sequence.current) failure(e);}
    finally {if(id===sequence.current){flight.current=false;setBusy(false);}}
  };
  // presentation only: the heading of the open view receives focus so keyboard and screen-reader users land where the content changed
  const heading = useRef<HTMLHeadingElement|null>(null), opened = selected?.canonical_id ?? null;
  useEffect(() => { if (opened) heading.current?.focus({preventScroll:false}); }, [opened]);
  return <main className="pw-page pm" aria-busy={busy}>
    <header className="pw-page-title"><p className="pw-trail">NEXO · {m.eyebrow}</p><h1 data-private-heading tabIndex={-1}>{m.title}</h1><p className="pw-lead">{m.lead}</p><p className="pw-muted">{m.limit}</p></header>
    {bridge && <section className="pm-bridge" aria-label={m.bridge}>{bridge}</section>}
    <div className="pm-live" aria-live="polite">{notice && <p className="pm-notice" role="alert">{notice}</p>}{busy && <p className="pw-quiet" role="status">{m.loading}</p>}</div>
    {!selected ? <>
      <form className="pm-filters" role="search" onSubmit={e=>{e.preventDefault();void load();}}>
        <label className="pm-query">{m.search}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} maxLength={256} placeholder={m.query}/></label>
        <label>{m.kind}<select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">{m.all}</option>{page?.kinds.map(k=><option key={k}>{k}</option>)}</select></label>
        <label>{m.filter}<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">{m.all}</option><option value="provisional">{m.provisional}</option><option value="feedback">{m.feedback}</option><option value="annotations">{m.annotations}</option></select></label>
        <label className="pm-related">{m.related}<input value={related} onChange={e=>setRelated(e.target.value)} maxLength={256}/></label>
        <button className="pw-button" disabled={busy}>{m.find}</button>
      </form>
      {page && <>
        <p className="pw-quiet">{page.items.length ? `${m.page} ${page.offset + 1} ${m.to} ${page.offset + page.items.length} ${m.of} ${page.total}` : `${page.total} ${m.count}`} · {m.observed} <time dateTime={page.observed_at}>{when(page.observed_at, lang)}</time></p>
        {page.items.length===0 && <p className="pw-empty" role="status">{m.none}</p>}
        {page.items.length>0 && <ol className="pw-rows pm-results">{page.items.map(row=><li key={row.canonical_id}>
          <p className="pw-path">{row.kind}{row.provisional ? ` · ${m.provisional}` : ''}</p>
          <h2><button type="button" className="pm-open" disabled={busy} onClick={()=>{setSelected(row);clearDraft();setNotice('');}}>{row.title}<span className="pw-sr"> · {m.open}</span></button></h2>
          {row.topic && <p className="pw-row-question">{row.topic}</p>}
          <dl className="pw-states"><div><dt>{m.stateLabel}</dt><dd>{stateText(row.state, lang)}</dd></div></dl>
          <p className="pw-code">{row.object_id}</p>
        </li>)}</ol>}
        <div className="pm-actions"><button className="pw-button" disabled={busy||page.offset===0} onClick={()=>void load(Math.max(0,page.offset-30),page.source_revision)}>← {m.prev}</button><button className="pw-button" disabled={busy||page.next_offset===null} onClick={()=>void load(page.next_offset!,page.source_revision)}>{m.next} →</button><button className="pw-button" disabled={busy} onClick={()=>void load()}>{m.refresh}</button></div>
        <details className="pw-technical"><summary>{m.revision}</summary><p className="pw-code">{page.source_revision}</p></details></>}
    </> : <section className="pm-record" aria-labelledby="pm-record-title">
      <p><button type="button" className="pw-button" disabled={busy} onClick={()=>{setSelected(null);clearDraft();setNotice('');}}>← {m.back}</button></p>
      <p className="pw-path">{selected.kind}{selected.provisional ? ` · ${m.provisional}` : ''}</p>
      <h2 id="pm-record-title" ref={heading} tabIndex={-1}>{selected.title}</h2>
      <dl className="pw-pairs"><div><dt>{m.stateLabel}</dt><dd>{stateText(selected.state, lang)}</dd></div></dl>
      <h3>{m.details}</h3><div className="pw-prose">{selected.text.split(/\n{2,}/).map((block,index)=><p key={index}>{block}</p>)}</div>{selected.truncated && <p className="pw-absent">{m.short}</p>}
      <div className="pw-folds">
        <details open><summary>{m.lineage}</summary><div>
          <h3>{m.source}</h3><dl className="pw-pairs">{Object.entries(selected.citation).map(([k,v])=><div key={k}><dt>{(m.cite as Record<string,string>)[k] ?? <span className="pw-key">{k}</span>}</dt><dd className="pw-code">{v}</dd></div>)}</dl>
          <h3>{m.refs}</h3>{selected.refs.length ? <ul className="pw-list">{selected.refs.map(ref=><li key={ref} className="pw-code">{ref}</li>)}</ul> : <p className="pw-absent">{m.noRefs}</p>}
        </div></details>
        <details className="pm-history"><summary>{m.history}<span>{selected.history_total ?? 0}</span></summary><div>{!selected.history?.length ? <p className="pw-absent">{m.noHistory}</p> : <ol className="pw-entries">{selected.history.map(row=><li key={row.canonical_id}>
          <h3>{row.title}</h3><p className="pw-quiet">{stateText(row.state, lang)}</p><div className="pw-prose"><p>{row.text}</p></div><p className="pw-code">{row.citation.entity_version} · {row.citation.path}</p>
          {!selected.history?.some(v=>v.supersedes===row.canonical_id) && <button type="button" className="pw-button" disabled={busy} onClick={()=>{setEditing(true);setReview(null);setSupersedes(row.canonical_id);setAnnotation(row.annotation_text || '');setReason('');setAnnotationType(row.annotation_type || 'NOTE');}}>{m.revise}</button>}
        </li>)}</ol>}</div></details>
      </div>
      {selected.ambiguous_identity ? <p className="pm-notice" role="alert">{m.ambiguous}</p> : !editing && <button type="button" className="pw-button" onClick={()=>setEditing(true)}>{m.edit}</button>}
      {editing && <form className="pm-editor" onSubmit={prepare} aria-labelledby="pm-editor-title"><h2 id="pm-editor-title">{m.edit}</h2><p className="pw-muted">{m.editLead}</p><p className="pm-notice">{m.blocked}</p>
        {supersedes && <p className="pw-quiet">{m.supersedesNote}</p>}
        <label>{m.type}<select value={annotationType} disabled={busy} onChange={e=>{setAnnotationType(e.target.value);setReview(null);}}><option value="NOTE">{m.note}</option><option value="CORRECTION">{m.correction}</option><option value="DECISION">{m.decision}</option></select></label>
        <label>{m.body}<textarea value={annotation} disabled={busy} required maxLength={6000} rows={7} onChange={e=>{setAnnotation(e.target.value);setReview(null);}}/></label>
        <label>{m.reason}<textarea value={reason} disabled={busy} required maxLength={1500} rows={3} onChange={e=>{setReason(e.target.value);setReview(null);}}/></label>
        <div className="pm-actions"><button className="pw-button" disabled={busy||!annotation.trim()||!reason.trim()}>{m.review}</button><button type="button" className="pw-button" disabled={busy} onClick={clearDraft}>{m.cancel}</button></div>
        {review && <section className="pm-review" role="status"><p className="pw-label">{m.draftBadge}</p><h3>{m.draft}</h3><p>{m.notSaved}</p><p className="pw-quiet">{m.readonly}</p><details><summary>{m.reviewJson}</summary><textarea readOnly rows={12} aria-label={m.reviewJson} value={JSON.stringify(review,null,2)}/></details></section>}
      </form>}
    </section>}
  </main>;
}
