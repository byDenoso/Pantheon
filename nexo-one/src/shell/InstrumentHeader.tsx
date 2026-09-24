import type {FormEvent, RefObject} from 'react';
import type {SyncStatus} from '../data/useSystem.ts';
import type {ViewId} from '../app/navigation.ts';

type ProductMode='inicio'|'ciencia'|'operacao'|'prova'|'sistema'|'mapa'|'pessoal'|'galaxia';
const PATHS:Record<string,string>={
  inicio:'M2 8 8 2l6 6v6H9v-4H7v4H2z', ciencia:'M8 2v4m0 0a4 4 0 1 0 0 8 4 4 0 0 0 0-8m0 0 3-3',
  operacao:'M2 3h12M2 8h12M2 13h12', prova:'M3 2h10v12H3zM5 5h6m-6 3h6m-6 3h3',
  mapa:'M8 1.5 14 5v6l-6 3.5L2 11V5zM2 5l6 3.5L14 5M8 8.5v6', galaxia:'M8 8m-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0M8 2.5c3.4 0 5.5 2.3 5.5 4.6M8 13.5c-3.4 0-5.5-2.3-5.5-4.6M13.5 7.1c0 2.9-2.3 4.3-4.6 4.3M2.5 8.9c0-2.9 2.3-4.3 4.6-4.3', sistema:'M3 3h4v4H3zM9 9h4v4H9zM7 5h2a2 2 0 0 1 2 2v2M1 11h2m10-8h2', pessoal:'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-6 6a6 6 0 0 1 12 0',
  OVERVIEW:'M8 1.5 14.5 8 8 14.5 1.5 8z',INBOX:'M2 3h12v9H9l-2 2-2-2H2z',ACTIONS:'M2 3h12M2 8h12M2 13h12',EXECUTION:'M2 12 6 8l2 2 5-6m-3 0h3v3',TRUTHGRAPH:'M3 2h10v12H3zM5 5h6m-6 3h6m-6 3h3',CAPABILITIES:'M8 1.5 14.5 5v6L8 14.5 1.5 11V5z',SOURCES:'M2 2h12v12H2zM5 5h6M5 8h6M5 11h4',INTEGRITY:'M8 1.5 14 4v4c0 3.5-2.4 5.2-6 6.5C4.4 13.2 2 11.5 2 8V4zM5 8l2 2 4-4',LEARNING:'M2 11c2-8 4 8 6 0s4 8 6 0',NOW:'M8 2v6l4 2',LOOPS:'M3 5a5 5 0 0 1 9-2l1 2m0-3v3h-3M13 11a5 5 0 0 1-9 2l-1-2m0 3v-3h3',DAY:'M2 3h12v11H2zM5 1v4m6-4v4M2 6h12',CONTEXT:'M2 4h12v8H2zM5 7h6m-6 3h4',RECALL:'M7 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10m4 9 3 3',
};
export function ProductIcon({name,size=16}:{name:string;size?:number}){return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={PATHS[name]||PATHS.cockpit}/></svg>}

export function InstrumentHeader({
  mode,view,theme,syncStatus,readAt,fingerprint,command,commandRef,onCommandChange,onCommandSubmit,onThemeToggle,onSync,onNavigate,onAccountClick,privateSession,
}:{
  mode:ProductMode;view:ViewId;theme:string;syncStatus:SyncStatus;readAt:string|null;fingerprint:string;command:string;
  commandRef:RefObject<HTMLInputElement|null>;onCommandChange:(value:string)=>void;onCommandSubmit:(event:FormEvent)=>void;
  onThemeToggle:()=>void;onSync:()=>void;onNavigate:(mode:ProductMode)=>void;onAccountClick?:()=>void;privateSession?:boolean;
}){
  const freshness=readAt?formatAge(readAt):'sem leitura';
  const modes:Array<[ProductMode,string]>=[['inicio','Início'],['galaxia','Galáxia'],['ciencia','Ciência'],['operacao','Operação'],['prova','Prova'],['sistema','Sistema'],['mapa','Mapa'],['pessoal','Pessoal']];
  const busy=syncStatus==='SYNCING';
  return <header className="instrument-header">
    <a href="#/cockpit/comando" className="instrument-brand" onClick={e=>{e.preventDefault();onNavigate('inicio')}} aria-label="NEXO ONE — Início">
      <span className="instrument-mark">N</span><strong>NEXO <em>ONE</em></strong>
    </a>
    <nav className="instrument-modes" aria-label="Modo do produto">
      {modes.map(([id,label])=><button type="button" key={id} className={mode===id?'active':''} aria-current={mode===id?'page':undefined} onClick={()=>onNavigate(id)} title={label}>
        <ProductIcon name={id}/><span>{label}</span>
      </button>)}
    </nav>
    <div className="instrument-provenance" title={fingerprint||'Aguardando fingerprint da projeção'}>
      <span className="instrument-live-dot"/>
      <strong>TOWER G6</strong><code>{fingerprint?fingerprint.slice(0,14):'fp pendente'}</code>
      <span>sync {freshness}</span><span className="instrument-schedulers">Science :20 · Exec :05 · drift 0</span>
    </div>
    <form className="instrument-search" onSubmit={onCommandSubmit}>
      <ProductIcon name="RECALL"/><input ref={commandRef} value={command} onChange={e=>onCommandChange(e.target.value)} placeholder="Ir para…" aria-label="Buscar e navegar"/>
      <kbd>⌘K</kbd>
    </form>
    <button className="instrument-sync" type="button" onClick={onSync} disabled={busy} aria-label={busy?'Sincronizando':'Sincronizar Tower'} title={busy?'Buscar → validar → comparar fingerprint':'Sincronizar Tower'}>
      <span className={busy?'spinning':''} aria-hidden="true">↻</span><span>{busy?'Verificando':'Sync'}</span>
    </button>
    <button className="instrument-theme" type="button" onClick={onThemeToggle} aria-label={theme==='dark'?'Ativar tema claro':'Ativar tema escuro'} title="Alternar tema">{theme==='dark'?'☼':'☾'}</button>
    {onAccountClick&&<button className="instrument-account" type="button" onClick={onAccountClick} aria-label="Abrir conta e sessão">{privateSession?'P':'D'}</button>}
  </header>;
}
function formatAge(value:string){
  const millis=Date.now()-Date.parse(value);if(!Number.isFinite(millis)||millis<0)return 'agora';
  const minutes=Math.floor(millis/60000);return minutes<1?'agora':minutes<60?`há ${minutes} min`:`há ${Math.floor(minutes/60)} h`;
}
