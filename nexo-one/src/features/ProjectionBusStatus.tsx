import {useEffect,useState} from 'react';
import type {UniversalProjectionState} from '../contracts/projection';

const stateColor:Record<string,string>={LIVE:'#55d98d',SNAPSHOT:'#6eb6ff',STALE:'#f0b95b',BLOCKED:'#ff8a65',DEGRADED:'#ff6b6b'};

export function ProjectionBusStatus(){
  const [bus,setBus]=useState<UniversalProjectionState|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{let live=true;fetch('/api/projections').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(x=>{if(live)setBus(x);}).catch(()=>{if(live)setError(true);});return()=>{live=false;};},[]);
  const state=error?'DEGRADED':bus?.state||'SNAPSHOT';
  return <aside aria-label="Universal Projection Bus" data-testid="projection-bus" style={{position:'fixed',right:16,top:72,zIndex:30,width:'min(420px,calc(100vw - 32px))',pointerEvents:'none',fontSize:12}}>
    <details style={{marginLeft:'auto',width:'fit-content',maxWidth:'100%',border:'1px solid rgba(128,128,128,.28)',borderRadius:12,background:'var(--surface,#12151b)',boxShadow:'0 12px 40px rgba(0,0,0,.28)',padding:'10px 12px',pointerEvents:'auto'}}>
      <summary style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',listStyle:'none'}}>
        <i aria-hidden="true" style={{width:8,height:8,borderRadius:99,background:stateColor[state]||'#aaa'}}/>
        <strong>PROJECTION BUS</strong><span data-testid="projection-state">{state}</span>
        <span style={{marginLeft:'auto',opacity:.65}}>{bus?.envelopes.length??'—'} envelopes</span>
      </summary>
      <div style={{marginTop:9,display:'grid',gap:7,width:'min(396px,calc(100vw - 56px))',maxHeight:'min(60vh,480px)',overflow:'auto'}}>
        <div><b>Contrato</b> <code>{bus?.contract||'ProjectionEnvelope/v1'}</code></div>
        <div><b>Fingerprint</b> <code data-testid="projection-fingerprint">{bus?.fingerprint||'UNAVAILABLE'}</code></div>
        {(bus?.sources||[]).map(source=><div key={source.id} data-testid={`projection-source-${source.id}`} style={{display:'grid',gridTemplateColumns:'120px 78px 1fr',gap:6}}><b>{source.id}</b><span>{source.state}</span><code title={source.revision} style={{overflow:'hidden',textOverflow:'ellipsis'}}>{source.revision}</code></div>)}
        {bus?.envelopes.slice(0,4).map(env=><div key={`${env.source}:${env.entity_id}`} style={{borderTop:'1px solid rgba(128,128,128,.18)',paddingTop:6}}><div><b>{env.entity_id}</b> · {env.state}</div><div style={{opacity:.7}}>source_ref: {env.source_ref}</div><div style={{opacity:.7}}>freshness: {env.freshness.state} · rev {env.source_revision}</div></div>)}
        <small style={{opacity:.65}}>Projection é somente leitura e nunca assume autoridade da fonte.</small>
      </div>
    </details>
  </aside>;
}
