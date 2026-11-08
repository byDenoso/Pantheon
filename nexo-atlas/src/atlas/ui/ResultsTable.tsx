import {useMemo,useState} from 'react';
import type {Locale} from '../api.ts';
import {pick} from '../publicItems.ts';
import {STATE_LABELS,type ResearchEntry} from '../researchExplorer.ts';

type Column = 'question'|'data'|'test'|'result'|'limit'|'status'|'date';

/** One row per published question. Data not separately supplied by the public projection stays unknown. */
export default function ResultsTable({entries,locale}:{entries:ResearchEntry[];locale:Locale}) {
  const en=locale==='en';
  const [sort,setSort]=useState<{column:Column;ascending:boolean}>({column:'question',ascending:true});
  const missing=en?'Not specified in the summary':'Não discriminado no resumo';
  const columns:{key:Column;label:string}[]=[
    {key:'question',label:en?'Question':'Pergunta'}, {key:'data',label:en?'Data':'Dados'},
    {key:'test',label:en?'Test / method':'Teste / método'}, {key:'result',label:en?'Result':'Resultado'},
    {key:'limit',label:en?'Limit':'Limite'}, {key:'status',label:en?'Publication status':'Estado de publicação'},
    {key:'date',label:en?'Updated':'Atualização'},
  ];
  const value=(e:ResearchEntry,key:Column):string=>{
    switch(key){
      case 'question':return pick(e.question,locale);
      case 'data':return e.data?pick(e.data,locale):missing;
      case 'test':return e.method?pick(e.method,locale):missing;
      case 'result':return e.summary?pick(e.summary,locale):missing;
      case 'limit':return e.limits.length?e.limits.map(v=>pick(v,locale)).join(' '):missing;
      case 'status':return pick(STATE_LABELS[e.state],locale);
      case 'date':return e.updatedAt??'';
    }
  };
  const ordered=useMemo(()=>[...entries].sort((a,b)=>{
    const va=value(a,sort.column),vb=value(b,sort.column);
    // Unknown values stay at the end in both directions.
    if(!va||va===missing)return !vb||vb===missing?0:1;
    if(!vb||vb===missing)return -1;
    const comparison=sort.column==='date'?Date.parse(va)-Date.parse(vb):va.localeCompare(vb,locale,{numeric:true,sensitivity:'base'});
    return comparison*(sort.ascending?1:-1);
  }),[entries,locale,sort]);
  const change=(column:Column)=>setSort(old=>({column,ascending:old.column===column?!old.ascending:true}));
  return <section className="nexo-results-table" aria-labelledby="nexo-results-table-title">
    <h4 id="nexo-results-table-title">{en?'Questions at a glance':'Perguntas em tabela'}</h4>
    <p>{en?'Each row summarizes one published question. Open it for the individual analyses and their sources.':'Cada linha resume uma pergunta publicada. Abra a pergunta para consultar as análises e suas fontes.'}</p>
    <div className="nexo-table-scroll" tabIndex={0} aria-label={en?'Scrollable table of research questions':'Tabela de perguntas com rolagem horizontal'}>
      <table><caption>{en?'Published questions and their limits':'Perguntas publicadas e seus limites'}</caption><thead><tr>{columns.map(c=><th key={c.key} scope="col" aria-sort={sort.column===c.key?(sort.ascending?'ascending':'descending'):'none'}><button type="button" onClick={()=>change(c.key)}>{c.label}<span aria-hidden="true">{sort.column===c.key?(sort.ascending?' ↑':' ↓'):' ↕'}</span></button></th>)}</tr></thead>
        <tbody>{ordered.map(e=><tr key={e.id}>{columns.map(c=><td key={c.key}>{c.key==='question'?<a href={e.href}>{value(e,c.key)}</a>:c.key==='date'&&e.updatedAt?<time dateTime={e.updatedAt}>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'America/Sao_Paulo'}).format(new Date(e.updatedAt))}</time>:c.key==='limit'&&e.limits.length?<span className="nexo-inline-limit">{value(e,c.key)}</span>:(value(e,c.key)||missing)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </section>;
}
