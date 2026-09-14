import type { ScientificObservation, ScientificObservationKind } from '../api/science-read-model';

const fmt=(value:unknown)=>typeof value==='number'?new Intl.NumberFormat('pt-BR',{maximumFractionDigits:5}).format(value):String(value??'—');
const uncertainty=(item:ScientificObservation)=>{
  const u=item.uncertainty;
  if(!u)return 'incerteza não publicada';
  if(u.sigma!==undefined)return `σ ${fmt(u.sigma)}${u.confidenceLevel?` · ${u.confidenceLevel}`:''}`;
  if(u.low!==undefined||u.high!==undefined)return `[${u.low!==undefined?fmt(u.low):'?'}, ${u.high!==undefined?fmt(u.high):'?'}]${u.confidenceLevel?` · ${u.confidenceLevel}`:''}`;
  return u.confidenceLevel||'incerteza publicada sem limites numéricos';
};

function MetricCard({item}:{item:ScientificObservation}){
  return <article className="scientific-observation scientific-observation--metric" data-kind={item.kind}>
    <span className="eyebrow">{item.metricId}</span><h3>{item.label}</h3>
    <strong>{fmt(item.value)}{item.unit?` ${item.unit}`:''}</strong>
    <small>{uncertainty(item)}</small>
    {item.stackLabel&&<span className="scientific-observation-meta">stack · {item.stackLabel}</span>}
  </article>;
}
function DirectionalCard({item}:{item:ScientificObservation}){
  return <article className="scientific-observation scientific-observation--directional" data-kind="directional"><span className="eyebrow">DIRECIONAL</span><h3>{item.label}</h3><strong>RA {item.ra!==undefined?fmt(item.ra):'—'} · Dec {item.dec!==undefined?fmt(item.dec):'—'}</strong><small>{item.status||'status não publicado'}</small></article>;
}
function SeriesCard({item}:{item:ScientificObservation}){
  return <article className="scientific-observation scientific-observation--series" data-kind="timeseries"><span className="eyebrow">SÉRIE TEMPORAL</span><h3>{item.label}</h3><strong>{item.points?.length||0} pontos publicados</strong><small>{item.points?.length?'Renderização baseada somente nos pontos publicados.':'Nenhum ponto publicado.'}</small></article>;
}
function MatrixCard({item}:{item:ScientificObservation}){
  const rows=item.matrix?.length||0,cols=item.matrix?.[0]?.length||0;
  return <article className="scientific-observation scientific-observation--matrix" data-kind="matrix"><span className="eyebrow">MATRIZ</span><h3>{item.label}</h3><strong>{rows} × {cols}</strong><small>{rows&&cols?'Matriz publicada; heatmap pode ser expandido sem mudar o contrato.':'Valores matriciais não publicados.'}</small></article>;
}
function DistributionCard({item}:{item:ScientificObservation}){
  return <article className="scientific-observation scientific-observation--distribution" data-kind="distribution"><span className="eyebrow">DISTRIBUIÇÃO</span><h3>{item.label}</h3><strong>{item.points?.length||0} amostras/pontos publicados</strong><small>Nenhuma forma de distribuição é inferida quando a fonte não a publica.</small></article>;
}
function CategoricalCard({item}:{item:ScientificObservation}){
  return <article className="scientific-observation scientific-observation--categorical" data-kind="categorical"><span className="eyebrow">CATEGÓRICO</span><h3>{item.label}</h3><strong>{fmt(item.value)}</strong><small>{item.categories?.length?item.categories.join(' · '):item.status||'categorias não publicadas'}</small></article>;
}

const DEFAULT_RENDERERS:Record<ScientificObservationKind,(props:{item:ScientificObservation})=>React.ReactNode>={
  scalar:MetricCard,
  interval:MetricCard,
  directional:DirectionalCard,
  timeseries:SeriesCard,
  matrix:MatrixCard,
  distribution:DistributionCard,
  categorical:CategoricalCard
};

const METRIC_OVERRIDES:Record<string,(props:{item:ScientificObservation})=>React.ReactNode>={
  'cosmology.H0':({item})=><article className="scientific-observation scientific-observation--h0" data-kind={item.kind}><span className="eyebrow">H0 · STACK</span><h3>{item.stackLabel||item.label}</h3><strong>H₀ = {fmt(item.value)} {item.unit||'km/s/Mpc'}</strong><small>{uncertainty(item)}</small></article>
};

export function ScientificObservationRenderer({item}:{item:ScientificObservation}){
  const Renderer=METRIC_OVERRIDES[item.metricId]||DEFAULT_RENDERERS[item.kind];
  return Renderer?Renderer({item}):null;
}
