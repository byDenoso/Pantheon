import type {H0StackMeasurement} from '../api/types';

export function H0StackForestPlot({items}:{items:H0StackMeasurement[]}){
  if(!items.length)return null;
  return <section className="h0-stack-panel">
    <header><span className="eyebrow">COMPARATIVO H0 POR STACK</span><h3>Configurações publicadas</h3><p>Valores H0 preservam exatamente o que a fonte publicou.</p></header>
    <div className="h0-stack-list">{items.map(item=><article className="h0-stack-row" key={item.id}><div><b>{item.stackLabel}</b><small>{[item.domain,item.primaryCampaign].filter(Boolean).join(' · ')}</small></div><strong>{item.h0.toFixed(2)} km/s/Mpc</strong><small>{item.uncertaintyLevel||'intervalo não publicado'}</small></article>)}</div>
  </section>;
}
