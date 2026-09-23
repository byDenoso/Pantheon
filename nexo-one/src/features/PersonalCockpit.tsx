import {useState} from 'react';
import type {CockpitItem,WorldState} from '../contracts/world.ts';
import type {PersonalView} from '../app/navigation.ts';
import {stateLabel,dateTime} from '../app/model.ts';
import {Workspace} from './Workspace.tsx';
import {FocusDrawer} from '../shell/FocusDrawer.tsx';
import {EmptyState} from '../components/states.tsx';

export function PersonalCockpit({view,world,loading,error,authenticated,query,setQuery,context,setContext}:{
  view:PersonalView;world:WorldState|null;loading:boolean;error:string;refresh:(reset?:boolean)=>void;authenticated:boolean;
  query:string;setQuery:(value:string)=>void;context:string;setContext:(value:string)=>void;
}){
  const [selected,setSelected]=useState<CockpitItem|null>(null);
  const providers=world?.providers??[];
  const available=providers.filter(provider=>provider.status==='AVAILABLE').length;
  const total=world?.providers_total??providers.length;
  const items=world?.items.length;
  const readAt=world?.generatedAt?dateTime(world.generatedAt):'não publicado';
  const access=world?.access==='PRIVATE'||authenticated?'fontes privadas protegidas':'sessão pública';

  return <div className="personal-plane">
    <div className="personal-status-line" role="status">
      <strong>Pessoal</strong><span>·</span><span>{items===undefined?'itens não publicados':`${items} itens`}</span><span>·</span><span>lido {readAt}</span><span>·</span><span>{access}</span>
      <details><summary>Fontes {available}/{total}</summary><div className="personal-status-popover">
        {error&&<div role="alert" className="notice-box">{error}</div>}
        {providers.length?providers.map(provider=><div className="personal-provider-row" key={provider.id}>
          <strong>{provider.label}</strong><span>{stateLabel[provider.status]??provider.status}</span>
          <small>{provider.message||'Sem mensagem adicional.'} · última leitura {provider.checkedAt?dateTime(provider.checkedAt):'não publicada'} · {provider.count??'itens não publicados'}</small>
        </div>):<div className="consult-empty">Fontes pessoais: não publicadas nesta leitura.</div>}
      </div></details>
    </div>

    {!authenticated&&<div className="notice-box">Sessão pública: dados privados permanecem protegidos e não são tratados como zero.</div>}
    {!world&&!loading&&!error
      ?<EmptyState title="Nenhuma leitura recebida do servidor." description="Fonte sem resposta permanece indisponível; ausência de leitura não vira zero."/>
      :<Workspace tab={view} world={world} onSelect={setSelected} context={context} setContext={setContext} query={query} onQuery={setQuery} loading={loading}/>}
    {selected&&<FocusDrawer item={selected} onClose={()=>setSelected(null)}/>}
  </div>;
}
