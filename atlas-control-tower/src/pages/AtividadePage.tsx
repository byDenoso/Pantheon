import {useEffect,useState} from 'react';
import {useAtlasSession} from '../state/useAtlasSession';

type ActivityItem={id:string;stage?:string;status?:string;timestamp?:string;workId?:string;label?:string;summary?:string};
type ReadState='LOADING'|'READY'|'DATA_UNAVAILABLE'|'ERROR';

export function AtividadePage(){
  const {api}=useAtlasSession();
  const [state,setState]=useState<ReadState>('LOADING');
  const [items,setItems]=useState<ActivityItem[]>([]);
  useEffect(()=>{
    let live=true;
    setState('LOADING');
    void api.research('activity').then(raw=>{
      if(!live)return;
      const data=(raw?.data&&typeof raw.data==='object'?raw.data:{}) as Record<string,unknown>;
      const status=String(raw?.status||data.state||'').toUpperCase();
      if(status==='DATA_UNAVAILABLE'){setItems([]);setState('DATA_UNAVAILABLE');return}
      setItems(Array.isArray(data.items)?data.items as ActivityItem[]:[]);
      setState('READY');
    }).catch(()=>{if(live){setItems([]);setState('ERROR')}});
    return()=>{live=false};
  },[api]);
  return <div className="page-wrap atividade-page">
    <div className="page-heading"><div><span className="eyebrow">NEXO ATLAS / ATIVIDADE</span><h1>Atividade</h1><p>Linha do tempo publicada de mudanças operacionais, em ordem de observação.</p></div></div>
    {state==='LOADING'&&<p role="status">Lendo atividade publicada…</p>}
    {state==='DATA_UNAVAILABLE'&&<p role="status">Fonte de atividade indisponível.</p>}
    {state==='ERROR'&&<p role="status">Falha ao ler a superfície de atividade. O restante do Atlas permanece disponível.</p>}
    {state==='READY'&&!items.length&&<p role="status">Nenhum evento publicado neste recorte.</p>}
    {state==='READY'&&items.length>0&&<ol className="activity-timeline">{items.map(item=><li key={item.id} className="activity-event"><div><span className="eyebrow">{item.stage||'EVENT'}</span><b>{item.label||item.workId||item.id}</b><p>{item.summary||'Sem resumo adicional publicado.'}</p></div><div className="activity-event-meta"><strong>{item.status||'UNKNOWN'}</strong><time dateTime={item.timestamp}>{item.timestamp||'sem timestamp publicado'}</time></div></li>)}</ol>}
  </div>;
}
