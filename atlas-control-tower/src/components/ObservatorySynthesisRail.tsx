import type {AtlasApiClient} from '../api/types';
import {useScienceReadModel} from '../api/hooks';
import {ScientificObservationRenderer} from './ScientificObservationRenderer';

function StateMessage({state,error}:{state:string;error?:string}){
  if(state==='LOADING')return <div className="observatory-synthesis-state" role="status"><b>Lendo síntese publicada…</b><small>O grafo continua navegável enquanto a leitura semântica é carregada.</small></div>;
  if(state==='DATA_UNAVAILABLE')return <div className="observatory-synthesis-state" role="status"><b>DATA_UNAVAILABLE</b><small>A projeção atual não publica síntese científica para este recorte.</small></div>;
  if(state==='API_ERROR')return <div className="observatory-synthesis-state" role="status"><b>ERROR</b><small>{error||'Falha ao ler o Science Read Model. O mapa estrutural permanece disponível.'}</small></div>;
  return null;
}

export function ObservatorySynthesisRail({api}:{api:AtlasApiClient}){
  const read=useScienceReadModel(api);
  const model=read.data;
  if(!model)return <div className="observatory-synthesis-rail"><StateMessage state={read.state} error={read.error}/></div>;

  const observations=model.observations||[];
  const comparisons=model.comparisons||[];
  const syntheses=model.syntheses||[];
  const source=read.freshness.source||model.provenance?.[0]?.source||'projeção autorizada';

  return <div className="observatory-synthesis-rail">
    <header>
      <div><span className="eyebrow">SÍNTESE / SRM V2</span><h2>Leitura científica publicada</h2></div>
      <span className={`synthesis-state synthesis-state--${read.state.toLowerCase()}`}>{read.state}</span>
    </header>
    <div className="observatory-synthesis-meta"><span>{read.freshness.state}</span><span>{source}</span>{model.sourceVersion&&<span>{model.sourceVersion}</span>}</div>
    <div className="observatory-synthesis-counts" aria-label="Conteúdo publicado no recorte"><span><b>{observations.length}</b> observações</span><span><b>{comparisons.length}</b> comparações</span><span><b>{syntheses.length}</b> sínteses</span></div>
    {observations.length>0?<div className="observatory-synthesis-observations">{observations.slice(0,3).map(item=><ScientificObservationRenderer key={item.id} item={item}/>)}</div>:<div className="observatory-synthesis-empty"><b>EMPTY · observações</b><small>Nenhuma observação científica foi publicada neste recorte.</small></div>}
    {comparisons.length>0?<div className="observatory-synthesis-comparisons"><span className="eyebrow">COMPARAÇÕES</span>{comparisons.slice(0,3).map(item=><article key={item.id}><b>{item.metricId||item.kind||item.id}</b><span>{item.status||'status não publicado'}</span>{item.significance!==undefined&&<strong>{item.significance}σ</strong>}{item.summary&&<small>{item.summary}</small>}</article>)}</div>:<div className="observatory-synthesis-empty"><b>EMPTY · comparações</b><small>Nenhuma comparação quantitativa foi publicada neste recorte.</small></div>}
    {syntheses.length>0?<div className="observatory-synthesis-list"><span className="eyebrow">SÍNTESES</span>{syntheses.slice(0,4).map(item=><article key={item.id}><div><b>{item.scopeId||item.scope}</b><span>{item.status}</span></div>{item.narrative&&<p>{item.narrative}</p>}<small>{item.updatedAt||'timestamp não publicado'}</small></article>)}</div>:<div className="observatory-synthesis-empty"><b>EMPTY · sínteses</b><small>Nenhuma síntese foi publicada para este recorte.</small></div>}
  </div>;
}
