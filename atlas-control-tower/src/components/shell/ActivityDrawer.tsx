import { useEffect, useState } from 'react';
import type { AtlasApiClient } from '../../api/types';
import { ACTIVITY_TABS, type ActivityTab as Tab } from './activity-tabs';

type Item = Record<string, unknown>;
type LiveActivity = {
  state: 'LIVE' | 'ERROR';
  truth_owner?: string;
  error?: string;
  data?: { changes?: Item[]; next?: Item[]; tests?: Item[]; filaments?: Item[] };
};

function label(item: Item) {
  return String(item.label || item.title || item.name || item.id || item.work_id || item.test_id || item.run_id || item.request_id || 'Item sem título');
}
function status(item: Item) { return String(item.status || item.state || item.outcome || item._kind || 'UNKNOWN'); }

function LiveList({ items, empty }: { items: Item[]; empty: string }) {
  if (!items.length) return <div className="drawer-empty" role="status"><span aria-hidden="true">∅</span><p>{empty}</p></div>;
  return <ul className="activity-drawer-list">{items.slice(0, 20).map((item, index) => {
    const id=String(item.id || item.work_id || item.test_id || item.run_id || item.request_id || `${label(item)}:${index}`);
    return <li key={id}><span>{label(item)}</span><small>{status(item)}</small></li>;
  })}</ul>;
}

export function ActivityDrawer({ api: _api }: { api: AtlasApiClient }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('changes');
  const [activity,setActivity]=useState<{state:'idle'|'loading'|'ready'|'error';payload:LiveActivity|null}>({state:'idle',payload:null});

  useEffect(()=>{
    if(!open || activity.state!=='idle') return;
    const controller=new AbortController();
    setActivity({state:'loading',payload:null});
    void fetch('/api/live/activity',{headers:{Accept:'application/json'},signal:controller.signal})
      .then(async response=>{
        const payload=await response.json() as LiveActivity;
        if(!response.ok || payload.state!=='LIVE') throw new Error(payload.error || `HTTP_${response.status}`);
        setActivity({state:'ready',payload});
      })
      .catch(error=>{
        if(error?.name==='AbortError')return;
        setActivity({state:'error',payload:{state:'ERROR',error:String(error?.message||error)}});
      });
    return ()=>controller.abort();
  },[open,activity.state]);

  const data=activity.payload?.data || {};
  const items = tab==='changes' ? data.changes || [] : tab==='next' ? data.next || [] : tab==='tests' ? data.tests || [] : data.filaments || [];
  const empty = tab==='changes' ? 'Nenhuma mutação ou execução recente na Tower.' : tab==='next' ? 'Nenhum WORK ativo na fila canônica.' : tab==='tests' ? 'Nenhum TEST canônico encontrado.' : 'Nenhum vínculo interdomínio ativo encontrado.';

  return (
    <div className={`activity-drawer ${open ? 'is-open' : ''}`}>
      <button type="button" className="activity-drawer-handle" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="activity-drawer-body">
        <span aria-hidden="true">{open ? '▾' : '▴'}</span><span>Atividade</span>
      </button>
      {open && <div id="activity-drawer-body" className="activity-drawer-body">
        <nav className="activity-drawer-tabs" aria-label="Abas de atividade">{ACTIVITY_TABS.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
        <div className="activity-drawer-panel">
          {activity.state==='loading' && <p role="status">Lendo TOWER_V06…</p>}
          {activity.state==='error' && <div className="drawer-empty" role="alert"><span aria-hidden="true">∅</span><p>LIVE_API_ERROR</p><small>{activity.payload?.error || 'Falha ao consultar TOWER_V06.'}</small><button onClick={()=>setActivity({state:'idle',payload:null})}>Tentar novamente</button></div>}
          {activity.state==='ready' && <LiveList items={items} empty={empty}/>} 
        </div>
      </div>}
    </div>
  );
}
