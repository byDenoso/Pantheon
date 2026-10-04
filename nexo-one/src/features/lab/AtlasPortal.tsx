import { useEffect, useMemo, useState } from 'react';
import type { Lab, TestEntity } from './model.ts';
import { ago, VERDICT_PT } from './model.ts';
import { labHref } from './routes.ts';
import './atlas-portal.css';

export type AtlasScale = 'overview' | 'research' | 'operational';
const seed = (id: string) => { let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
const color = (test: TestEntity, sourceCurrent: boolean) => test.verdict === 'BLOCKED' ? '#a68d74' : sourceCurrent && test.status === 'RUNNING' ? '#8adbd7' : test.verdict === 'REFUTED' ? '#cb8c90' : '#afc3e7';

/** Coordinates encode membership, never measured cosmological positions. */
export function AtlasPortal({ lab, fallback, sourceCurrent, scale, onScale, onFocus, onPanel, onSearch, selectedRegion, onRegionChange }: {
  lab: Lab; fallback: boolean; sourceCurrent: boolean; scale: AtlasScale; selectedRegion?: string | null; onRegionChange?: (id: string | null) => void;
  onScale: (scale: AtlasScale) => void; onFocus: (ids: string[]) => void; onPanel: () => void; onSearch: () => void;
}) {
  const [region, setRegion] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  useEffect(() => { if (selectedRegion !== undefined) setRegion(selectedRegion?.replace(/^domain:/, '') || null); }, [selectedRegion]);
  const model = useMemo(() => {
    const groups = new Map<string, TestEntity[]>();
    for (const test of lab.tests.values()) {
      if (test.contestOf) continue;
      const key = test.roadmapId || test.campaignId || test.domain;
      groups.set(key, [...(groups.get(key) || []), test]);
    }
    const regions = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([id, tests]) => {
      const angle = seed(id) * Math.PI * 2;
      const radius = 110 + seed(id + 'radius') * 220;
      return { id, tests, x: 500 + Math.cos(angle) * radius, y: 350 + Math.sin(angle) * radius * .72,
        name: lab.roadmaps.get(id)?.title || lab.campaigns.get(id)?.title || id,
        state: lab.roadmaps.get(id)?.state || 'PUBLICADO' };
    });
    const nodes = regions.flatMap(r => r.tests.map(t => {
      const h = t.hypothesisId || t.id, a = seed(h) * Math.PI * 2;
      const radius = 22 + seed(h + 'distance') * 58;
      return { test: t, region: r.id, x: r.x + Math.cos(a) * radius + (seed(t.id) - .5) * 24, y: r.y + Math.sin(a) * radius * .8 + (seed(t.id + 'y') - .5) * 24 };
    }));
    return { regions, nodes, byId: new Map(nodes.map(n => [n.test.id, n])) };
  }, [lab]);
  const selected = model.regions.find(r => r.id === region);
  useEffect(() => { if (region && !selected) { setRegion(null); onFocus([]); } }, [region, selected, onFocus]);
  const visibleTests = (selected?.tests || [...lab.tests.values()].filter(t => !t.contestOf)).filter(t => filter === 'all' || (filter === 'running' ? t.status === 'RUNNING' : t.verdict === 'BLOCKED'));
  const active = model.nodes.filter(n => n.test.status === 'RUNNING').length;
  const blocked = model.nodes.filter(n => n.test.verdict === 'BLOCKED').length;
  const hypothesisCount = new Set(model.nodes.map(n => n.test.hypothesisId).filter(Boolean)).size;
  const enter = (id: string) => { const r = model.regions.find(r => r.id === id); setRegion(id); onRegionChange?.(id); onScale('research'); onFocus(r?.tests.map(t => t.id) || []); };
  const changeScale = (next: AtlasScale) => { onScale(next); if (next === 'overview') { setRegion(null); onRegionChange?.(null); onFocus([]); } };
  const viewBox = selected && scale !== 'overview' ? `${selected.x - 155} ${selected.y - 130} 310 260` : '0 0 1000 700';
  return <section className="atlas-portal" aria-label="ATLAS — mapa vivo de pesquisa" data-scale={scale}>
    {fallback && <div className="atlas-projection"><svg viewBox={viewBox} aria-label="Projeção navegável dos projetos, testes e dependências" role="img">
      <defs><radialGradient id="atlas-halo"><stop stopColor="#829dcc" stopOpacity=".22"/><stop offset="1" stopColor="#829dcc" stopOpacity="0"/></radialGradient><filter id="atlas-glow"><feGaussianBlur stdDeviation="1.8"/></filter></defs>
      {model.regions.map(r => <g key={r.id} opacity={region && region !== r.id ? .16 : 1}>
        <ellipse cx={r.x} cy={r.y} rx={75 + Math.sqrt(r.tests.length) * 3} ry={50 + Math.sqrt(r.tests.length) * 2} fill="url(#atlas-halo)"/>
        {model.nodes.filter(n => n.region === r.id).map(n => <path key={n.test.id} d={`M${r.x},${r.y} Q${r.x + (n.x - r.x) * .25},${n.y} ${n.x},${n.y}`} fill="none" stroke={color(n.test, sourceCurrent)} strokeWidth=".7" opacity={n.test.verdict === 'BLOCKED' ? '.12' : '.3'}/>) }
        <circle cx={r.x} cy={r.y} r="3" fill="#e2d7bf"/>
      </g>)}
      {model.nodes.flatMap(n => n.test.parents.map(id => { const p = model.byId.get(id); return p ? <path key={`${id}:${n.test.id}`} d={`M${p.x},${p.y} Q${(p.x + n.x) / 2},${Math.min(p.y,n.y)-35} ${n.x},${n.y}`} fill="none" stroke="#a8cdd8" strokeWidth="1" strokeDasharray={n.test.verdict === 'BLOCKED' ? '3 5' : undefined} opacity=".4"/> : null; }))}
      {model.nodes.map(n => <a key={n.test.id} href={labHref('entidade',n.test.id)} aria-label={`${n.test.name} · ${VERDICT_PT[n.test.verdict]}`} className={sourceCurrent && n.test.status === 'RUNNING' ? 'atlas-node-running' : undefined} style={{opacity: region && region !== n.region ? .16 : 1}}>
        <title>{`${n.test.name} · ${VERDICT_PT[n.test.verdict]}`}</title><circle cx={n.x} cy={n.y} r="7" fill="transparent"/><circle cx={n.x} cy={n.y} r="4" fill={color(n.test, sourceCurrent)} opacity=".6" filter="url(#atlas-glow)"/><circle cx={n.x} cy={n.y} r={sourceCurrent && n.test.status === 'RUNNING' ? 2.5 : 1.4} fill={color(n.test, sourceCurrent)}/>
      </a>)}
    </svg></div>}
    <header className="atlas-title"><p>NEXO / OBSERVATÓRIO</p><h1>ATLAS<span>.</span></h1><p className="atlas-statement">A pesquisa tem uma forma.<br/>Explore suas conexões.</p></header>
    <div className="atlas-instruments"><span className={sourceCurrent ? 'atlas-fresh' : 'atlas-stale'}>{sourceCurrent ? 'LEITURA PUBLICADA' : 'LEITURA DESATUALIZADA'}</span><time>{ago(lab.generatedAt)}</time><button type="button" onClick={onSearch}>Buscar no universo <kbd>⌘ K</kbd></button><button type="button" onClick={onPanel}>Abrir observatório ↗</button></div>
    <nav className="atlas-scales" aria-label="Escala do ATLAS">{([['overview','01','Cosmos'],['research','02','Pesquisa'],['operational','03','Contexto']] as const).map(([id,n,label]) => <button key={id} type="button" aria-pressed={scale === id} onClick={() => changeScale(id)}><small>{n}</small>{label}</button>)}</nav>
    <aside className="atlas-index" aria-label={scale === 'overview' ? 'Regiões de pesquisa' : 'Contexto da pesquisa'}>
      <p className="atlas-eyebrow">{scale === 'overview' ? 'REGIÕES DE PESQUISA' : selected?.name || 'PESQUISAS PUBLICADAS'}</p>
      {scale === 'overview' ? <div className="atlas-regions">{model.regions.map((r,i) => <button key={r.id} type="button" onClick={() => enter(r.id)}><span className="atlas-region-num">{String(i+1).padStart(2,'0')}</span><span><strong>{r.name}</strong><small>{r.tests.length} testes · {r.state}</small></span><span>↗</span></button>)}</div> : <><label className="atlas-filter">Mostrar<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos os estados</option><option value="running">Em execução</option><option value="blocked">Bloqueados</option></select></label><div className="atlas-region-tests">{visibleTests.map(t => <a key={t.id} href={labHref('entidade',t.id)} onFocus={()=>onFocus([t.id])}><span>{t.name}</span><small>{VERDICT_PT[t.verdict]}</small>{scale === 'operational' && <em>{t.blocker || t.meaning || t.question || 'Abra para consultar evidências e execução.'}</em>}</a>)}{!visibleTests.length && <p>Nenhum teste neste filtro.</p>}</div></>}
    </aside>
    <footer className="atlas-status"><div><strong>{model.regions.length}</strong><span>regiões</span></div><div><strong>{hypothesisCount}</strong><span>hipóteses</span></div><div><strong>{sourceCurrent ? active : '—'}</strong><span>{sourceCurrent ? 'em execução' : 'execução não verificada'}</span></div><div><strong>{blocked}</strong><span>bloqueados</span></div></footer>
    <div className="atlas-key"><span>● execução: pulso</span><span>┄ bloqueio: conexão atenuada</span><p>{fallback ? 'Projeção 2D · WebGL indisponível neste dispositivo.' : 'Arraste para orbitar · role para aproximar · selecione para abrir.'}<br/>Posições representam relações do NEXO, não coordenadas astronômicas.</p></div>
  </section>;
}
