import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadGlobalSearchSources } from '../data/load-global-search';
import { buildGlobalSearchModel, type GlobalSearchResult } from '../data/global-search-model';

const GROUP_ORDER=['Ciência','Olympus','Learning','Operação','Proveniência'];

export function GlobalSearch(){
 const navigate=useNavigate();
 const [open,setOpen]=useState(false);
 const [query,setQuery]=useState('');
 const [loading,setLoading]=useState(false);
 const [model,setModel]=useState(()=>buildGlobalSearchModel({query:'',science:null,olympus:null,learning:null,ops:null,runs:null,audit:null}));
 const inputRef=useRef<HTMLInputElement>(null);
 const seq=useRef(0);

 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setOpen(true)}
   if(event.key==='Escape')setOpen(false);
  };
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[]);
 useEffect(()=>{if(open)setTimeout(()=>inputRef.current?.focus(),0)},[open]);
 useEffect(()=>{
  const q=query.trim();const current=++seq.current;
  if(!q){setLoading(false);setModel(buildGlobalSearchModel({query:'',science:null,olympus:null,learning:null,ops:null,runs:null,audit:null}));return}
  setLoading(true);
  const timer=window.setTimeout(()=>{
   void loadGlobalSearchSources(q).then(sources=>{
    if(current!==seq.current)return;
    setModel(buildGlobalSearchModel({query:q,...sources}));setLoading(false);
   }).catch(()=>{if(current===seq.current){setModel(buildGlobalSearchModel({query:q,science:null,olympus:null,learning:null,ops:null,runs:null,audit:null}));setLoading(false)}});
  },180);
  return()=>window.clearTimeout(timer);
 },[query]);

 const grouped=useMemo(()=>GROUP_ORDER.map(group=>({group,items:model.results.filter(item=>item.group===group)})).filter(entry=>entry.items.length),[model.results]);
 const choose=(item:GlobalSearchResult)=>{setOpen(false);setQuery('');navigate(item.path)};

 return <>
  <button className="nexo-search" type="button" onClick={()=>setOpen(true)} aria-haspopup="dialog">
   <span className="nexo-search-icon">⌕</span><span>Buscar no Atlas</span><kbd>⌘ K</kbd>
  </button>
  {open?<div className="search-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
   <section className="search-dialog" role="dialog" aria-modal="true" aria-label="Buscar no Atlas">
    <div className="search-input-row"><span>⌕</span><input ref={inputRef} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar ciência, Olympus, Learning, operação…" aria-label="Buscar no Atlas"/><kbd>esc</kbd></div>
    <div className="search-results">
     {!query.trim()?<div className="search-hint"><b>Busca transversal</b><p>Encontre entidades, aprendizados, runs e itens de proveniência.</p></div>:null}
     {loading?<div className="search-hint"><b>Buscando…</b><p>Consultando as projeções disponíveis.</p></div>:null}
     {!loading&&query.trim()&&!grouped.length?<div className="search-hint"><b>Nenhum resultado</b><p>{model.availableSources===0?'Fontes indisponíveis no momento.':'Nenhum item publicado corresponde a esta consulta.'}</p></div>:null}
     {!loading?grouped.map(entry=><section className="search-group" key={entry.group}>
      <header><span>{entry.group}</span><b>{entry.items.length}</b></header>
      <div>{entry.items.map(item=><button className="search-result" key={`${item.group}:${item.id}`} onClick={()=>choose(item)}>
       <span className="search-result-kind">{item.kind}</span><span className="search-result-main"><b>{item.title}</b><small>{item.description||item.id}</small></span><span className="search-result-status">{item.status||'↗'}</span>
      </button>)}</div>
     </section>):null}
    </div>
    <footer className="search-footer"><span>↵ abrir</span><span>esc fechar</span><span>{model.availableSources||'—'} fontes</span></footer>
   </section>
  </div>:null}
 </>;
}
