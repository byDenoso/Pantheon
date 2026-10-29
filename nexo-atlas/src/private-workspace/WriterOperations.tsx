import {useState} from 'react';
import type {SystemState} from '../contracts/system.ts';
type Row={intent_id:string;label:string;outcome:string;reason_code:string|null;receipt_id:string;result_revision:string;observed_at:string;result_records?:{id:string;source_ref:string;entity_version:number|null;observed_revision:string}[]};
type Status={source_revision:string;items:Row[];total:number;has_more:boolean};
export default function WriterOperations({state,lang}:{state:SystemState;lang:'pt-BR'|'en'}) {
  const view=(state as unknown as {writer_operations?:Status}).writer_operations;
  const [query,setQuery]=useState('');const en=lang==='en';
  if(!view)return <p>{en?'Writer receipts unavailable in this reading.':'Recibos do Writer indisponíveis nesta leitura.'}</p>;
  const shown=(value:unknown)=>typeof value==='string'&&value.trim()?value:(en?'Not recorded':'Não registrado');
  const rows=view.items.filter(row=>!query||[row.intent_id,row.receipt_id,row.outcome,row.reason_code].some(value=>value?.toLowerCase().includes(query.toLowerCase())));
  return <section className="pw-outline"><h2>{en?'Deliveries and receipts':'Entregas e recibos'}</h2>
    <p>{en?'Applied receipts require entity readback. Scientific execution is established separately.':'A aplicação exige conferir a entidade resultante. Execução científica tem comprovação própria.'}</p>
    <label>{en?'Find a request or receipt':'Buscar pedido ou recibo'} <input value={query} onChange={event=>setQuery(event.target.value)}/></label>
    {rows.length?<ol className="pw-rows">{rows.map(row=><li key={row.intent_id}><h3>{en?row.outcome:row.label}</h3>
      <p className="pw-code">{row.intent_id}</p>{row.reason_code&&<p>{row.reason_code}</p>}
      {row.result_records?.map(record=><p key={record.source_ref+record.id}>{en?'Result observed in Tower':'Resultado observado na Tower'}: {record.id}{record.entity_version!==null&&` · ${en?'version':'versão'} ${record.entity_version}`}</p>)}
      <details><summary>{en?'Receipt and source revision':'Recibo e revisão da fonte'}</summary><dl className="pw-pairs">
        <div><dt>{en?'Receipt':'Recibo'}</dt><dd className="pw-code">{shown(row.receipt_id)}</dd></div>
        <div><dt>{en?'Applied revision':'Revisão aplicada'}</dt><dd className="pw-code">{shown(row.result_revision)}</dd></div>
        <div><dt>{en?'Observed':'Observado'}</dt><dd>{shown(row.observed_at)}</dd></div>
      </dl></details></li>)}</ol>:<p>{en?'No matching receipt in this reading. Check the inbox before retrying.':'Nenhum recibo correspondente nesta leitura. Confira a INBOX antes de reenviar.'}</p>}
    {view.has_more&&<p>{en?'Showing the latest 50 requests.':'Exibindo os 50 pedidos mais recentes.'}</p>}
  </section>;
}
