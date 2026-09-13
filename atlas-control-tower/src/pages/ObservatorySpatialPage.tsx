import {useEffect,useState} from 'react';
import type {AtlasContext,AtlasApiClient,Provenance} from '../api/types';
import {useObservatoryData} from '../api/hooks';
import type {AtlasActions,AtlasUiState} from '../state/useAtlasSession';
import {ObservatorySpatialMap} from './ObservatorySpatialMap';
import {DirectionalSignalPanel,HubbleTensionPanel,UniverseSnapshotPanel,WeightedH0Panel} from './atlas-pages';

type Props={
  api:AtlasApiClient;
  state:AtlasUiState;
  actions:AtlasActions;
  context:AtlasContext;
  reducedMotion:boolean;
  compact:boolean;
  navigate:(href:string)=>void;
  onProvenance:(title:string,items:Provenance[])=>void;
};

export function ObservatoryPage({api,state,actions,context,reducedMotion,compact,onProvenance}:Props){
  const data=useObservatoryData(api,context);
  const [detail,setDetail]=useState<string|null>(null);
  useEffect(()=>{
    if(context.domain&&state.focusId!==`domain:${context.domain}`)void actions.open({id:`domain:${context.domain}`,type:'DOMAIN',label:context.domain});
  },[actions,context.domain,state.focusId]);

  const signals=<div className="observatory-signals-grid">
    <WeightedH0Panel state={data} onProvenance={onProvenance} onOpen={()=>setDetail('H0 ponderado')}/>
    <HubbleTensionPanel state={data} onProvenance={onProvenance} onOpen={result=>setDetail(`Tensão H0 · ${result.label}`)}/>
    <DirectionalSignalPanel state={data} onProvenance={onProvenance} onOpen={signal=>setDetail(`Sinal direcional · ${signal.label}`)}/>
    <UniverseSnapshotPanel state={data} onProvenance={onProvenance} onOpen={parameterId=>setDetail(`Parâmetro · ${parameterId}`)}/>
  </div>;

  return <>
    <ObservatorySpatialMap state={state} actions={actions} reducedMotion={reducedMotion} compact={compact} signals={signals}/>
    {detail&&<div className="dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setDetail(null)}}><section className="detail-dialog" role="dialog" aria-modal="true" aria-label={detail}><header><div><span className="eyebrow">OBSERVATÓRIO</span><h2>{detail}</h2></div><button className="icon-button" onClick={()=>setDetail(null)} aria-label="Fechar detalhe">×</button></header><div className="detail-dialog-body"><p>Detalhes adicionais permanecem limitados ao contrato publicado pela fonte.</p><small>Nenhuma análise complementar é inferida no cliente.</small></div></section></div>}
  </>;
}