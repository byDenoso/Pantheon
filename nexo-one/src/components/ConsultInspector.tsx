import {useState,type ReactNode} from 'react';

type InspectorTab='resumo'|'relacoes'|'prova'|'origem';
const TABS:Array<[InspectorTab,string]>=[['resumo','Resumo'],['relacoes','Relações'],['prova','Prova'],['origem','Origem']];

export function ConsultInspector({entityId,title,kind,status,summary,relations,proof,origin,onClose,mapHref,systemHref,initialCollapsed=false}:{entityId:string;title:string;kind?:string;status?:string;summary?:ReactNode;relations?:ReactNode;proof?:ReactNode;origin?:ReactNode;onClose?:()=>void;mapHref?:string;systemHref?:string;initialCollapsed?:boolean;}){
  const [tab,setTab]=useState<InspectorTab>('resumo');
  const [collapsed,setCollapsed]=useState(initialCollapsed);
  if(collapsed)return <aside className="consult-inspector collapsed" data-entity-id={entityId}><button type="button" className="consult-inspector-expand" onClick={()=>setCollapsed(false)} aria-label="Expandir inspector">[</button></aside>;
  const body=tab==='resumo'?summary:tab==='relacoes'?relations:tab==='prova'?proof:origin;
  return <aside className="consult-inspector" data-entity-id={entityId}>
    <header><div><strong>{title}</strong><small>{kind||'Entidade'}{status?` · ${status}`:''}</small></div><div className="consult-inspector-window"><button type="button" onClick={()=>setCollapsed(true)} aria-label="Recolher inspector">]</button>{onClose&&<button type="button" onClick={onClose} aria-label="Fechar inspector">×</button>}</div></header>
    <code className="consult-inspector-id">{entityId}</code>
    <nav aria-label="Inspector">{TABS.map(([id,label])=><button type="button" key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    <div className="consult-inspector-body">{body||<p className="consult-inspector-empty">não publicado</p>}</div>
    <footer>{mapHref&&<a href={mapHref}>Ver no Mapa</a>}{systemHref&&<a href={systemHref}>Ver no Sistema</a>}<button type="button" onClick={()=>void navigator.clipboard?.writeText(location.href)}>Copiar link</button></footer>
  </aside>;
}
