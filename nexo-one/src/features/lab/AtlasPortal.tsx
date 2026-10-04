import { useEffect, useMemo, useState } from 'react';
import type { Lab, TestEntity } from './model.ts';
import { ago, VERDICT_PT } from './model.ts';
import { labHref } from './routes.ts';
import './atlas-portal.css';

export type AtlasScale = 'overview' | 'research' | 'operational';
const seed = (id: string) => { let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
const color = (test: TestEntity, sourceCurrent: boolean) => test.verdict === 'BLOCKED' ? '#a68d74' : sourceCurrent && test.status === 'RUNNING' ? '#8adbd7' : test.verdict === 'REFUTED' ? '#cb8c90' : '#afc3e7';

type WebPoint = { x: number; y: number };
/** Static density traces of published membership. Particles are samples, not extra entities. */
function densityTrace(a: WebPoint, b: WebPoint, id: string, broad = false) {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length, ny = dx / length;
  const bend = (seed(id + ':bend') - .5) * Math.min(length * .65, 125);
  const point = (t: number, lane = 0): WebPoint => {
    const envelope = Math.sin(Math.PI * t);
    const wave = Math.sin(t * Math.PI * 2 + seed(id) * 6.28) * envelope * (broad ? 5 : 2);
    const offset = bend * envelope + lane * envelope + wave;
    return { x: a.x + dx * t + nx * offset, y: a.y + dy * t + ny * offset };
  };
  const lanes: string[] = [], dust: string[] = [], stars: string[] = [];
  for (let lane = 0; lane < (broad ? 7 : 3); lane += 1) {
    const spread = (lane - (broad ? 3 : 1)) * (broad ? 3.5 : 1.2);
    lanes.push(Array.from({ length: 25 }, (_, i) => { const p = point(i / 24, spread); return `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' '));
  }
  const count = Math.min(240, Math.max(22, Math.ceil(length * (broad ? 1.6 : .7))));
  for (let i = 0; i < count; i += 1) {
    const t = seed(`${id}:${i}:t`), p = point(t);
    const spread = (broad ? 10 : 4) * (.15 + Math.sin(Math.PI * t));
    const offset = (seed(`${id}:${i}:j`) - .5) * spread;
    const x = p.x + nx * offset, y = p.y + ny * offset;
    (i % 11 === 0 ? stars : dust).push(`M${x.toFixed(1)},${y.toFixed(1)}h.01`);
  }
  return { path: lanes.join(' '), dust: dust.join(' '), stars: stars.join(' ') };
}

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
      const radius = 135 + seed(id + 'radius') * 290;
      return { id, tests, domain: tests[0]?.domain || '', x: 500 + Math.cos(angle) * radius, y: 360 + Math.sin(angle) * radius * .78,
        name: lab.roadmaps.get(id)?.title || lab.campaigns.get(id)?.title || id,
        state: lab.roadmaps.get(id)?.state || 'PUBLICADO' };
    });
    const nodes = regions.flatMap(r => r.tests.map(t => {
      const h = t.hypothesisId || t.id, a = seed(h) * Math.PI * 2;
      const radius = 28 + seed(h + 'distance') * 72;
      return { test: t, region: r.id, x: r.x + Math.cos(a) * radius + (seed(t.id) - .5) * 24, y: r.y + Math.sin(a) * radius * .8 + (seed(t.id + 'y') - .5) * 24 };
    }));
    const nodesByRegion = new Map<string, typeof nodes>();
    for (const node of nodes) { const members = nodesByRegion.get(node.region); if (members) members.push(node); else nodesByRegion.set(node.region, [node]); }
    const densityRegions = regions.slice(0, 96);
    const traceBudget = Math.min(64, Math.max(1, Math.floor(384 / Math.max(1, densityRegions.length))));
    const density = fallback ? densityRegions.map(r => {
      const members = [...(nodesByRegion.get(r.id) || [])].sort((a,b)=>a.test.id.localeCompare(b.test.id)).slice(0, traceBudget);
      const traces = members.map(n => densityTrace(r, n, `${r.id}:${n.test.id}`));
      return { id: r.id, path: traces.map(t => t.path).join(' '), dust: traces.map(t => t.dust).join(' '), stars: traces.map(t => t.stars).join(' ') };
    }) : [];
    // Geometric tissue encodes a shared published domain, never a dependency.
    const tissue = fallback ? densityRegions.flatMap((r, i) => densityRegions.slice(i + 1).filter(other => other.domain === r.domain)
      .sort((a, b) => Math.hypot(a.x-r.x,a.y-r.y)-Math.hypot(b.x-r.x,b.y-r.y)).slice(0, 2)
      .map(other => ({ id: `${r.id}:${other.id}`, a: r.id, b: other.id, ...densityTrace(r, other, `${r.id}:${other.id}`, true) }))) : [];
    return { regions, nodes, density, tissue, byId: new Map(nodes.map(n => [n.test.id, n])) };
  }, [lab, fallback]);
  const selected = model.regions.find(r => r.id === region);
  useEffect(() => { if (region && !selected) { setRegion(null); onFocus([]); } }, [region, selected, onFocus]);
  const visibleTests = (selected?.tests || [...lab.tests.values()].filter(t => !t.contestOf)).filter(t => filter === 'all' || (filter === 'running' ? sourceCurrent && t.status === 'RUNNING' : t.verdict === 'BLOCKED'));
  const active = model.nodes.filter(n => n.test.status === 'RUNNING').length;
  const blocked = model.nodes.filter(n => n.test.verdict === 'BLOCKED').length;
  const hypothesisCount = new Set(model.nodes.map(n => n.test.hypothesisId).filter(Boolean)).size;
  const enter = (id: string) => { const r = model.regions.find(r => r.id === id); setRegion(id); onRegionChange?.(id); onScale('research'); onFocus(r?.tests.map(t => t.id) || []); };
  const changeScale = (next: AtlasScale) => { onScale(next); if (next === 'overview') { setRegion(null); onRegionChange?.(null); onFocus([]); } };
  const viewBox = selected && scale !== 'overview' ? `${selected.x - 155} ${selected.y - 130} 310 260` : '0 0 1000 700';
  return <section className="atlas-portal" aria-label="ATLAS — mapa vivo de pesquisa" data-scale={scale}>
    {fallback && <div className="atlas-projection"><svg viewBox={viewBox} aria-label="Projeção navegável dos projetos, testes e dependências" role="img">
      <defs>
        <radialGradient id="atlas-halo"><stop stopColor="#a89ada" stopOpacity=".3"/><stop offset=".25" stopColor="#5552b4" stopOpacity=".16"/><stop offset="1" stopColor="#292b70" stopOpacity="0"/></radialGradient>
        <radialGradient id="atlas-core"><stop stopColor="#fff5cf" stopOpacity=".9"/><stop offset=".14" stopColor="#c9daf6" stopOpacity=".45"/><stop offset=".4" stopColor="#7876ca" stopOpacity=".15"/><stop offset="1" stopColor="#7876ca" stopOpacity="0"/></radialGradient>
        <filter id="atlas-glow"><feGaussianBlur stdDeviation="1.8"/></filter>
        <filter id="atlas-filament-haze" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
        <marker id="atlas-dependency-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1L7 4L1 7" fill="none" stroke="#a8cdd8" strokeWidth="1"/></marker>
      </defs>
      <g className="atlas-domain-tissue" aria-hidden="true" fill="none" strokeLinecap="round">
        {model.tissue.map(t => <g key={t.id} opacity={region && region !== t.a && region !== t.b ? .09 : .65}>
          <path d={t.path} stroke="#6959c4" strokeWidth="6" opacity=".1" filter="url(#atlas-filament-haze)"/>
          <path d={t.path} stroke="#456fbb" strokeWidth=".65" opacity=".23"/>
          <path d={t.dust} stroke="#69a9e8" strokeWidth=".7" opacity=".6"/>
          <path d={t.stars} stroke="#c1e3ff" strokeWidth="1.1" opacity=".85"/>
        </g>)}
      </g>
      {model.regions.map(r => <g key={r.id} opacity={region && region !== r.id ? .16 : 1}>
        <ellipse cx={r.x} cy={r.y} rx={95 + Math.sqrt(r.tests.length) * 4} ry={60 + Math.sqrt(r.tests.length) * 2} fill="url(#atlas-halo)"/>
        <circle cx={r.x} cy={r.y} r={16 + Math.sqrt(r.tests.length) * 1.5} fill="url(#atlas-core)"/>
        <circle cx={r.x} cy={r.y} r="2" fill="#f1e7c9"/>
      </g>)}
      <g aria-hidden="true" fill="none" strokeLinecap="round">{model.density.map(t => <g key={t.id} opacity={region && region !== t.id ? .12 : 1}>
        <path d={t.path} stroke="#6558b4" strokeWidth="3.5" opacity=".12" filter="url(#atlas-filament-haze)"/>
        <path d={t.path} stroke="#719bda" strokeWidth=".4" opacity=".2"/>
        <path d={t.dust} stroke="#8fc5f5" strokeWidth=".65" opacity=".72"/>
        <path d={t.stars} stroke="#e1edff" strokeWidth=".95" opacity=".85"/>
      </g>)}</g>
      {model.nodes.flatMap(n => n.test.parents.map(id => { const p = model.byId.get(id); return p ? <path key={`${id}:${n.test.id}`} d={`M${p.x},${p.y} Q${(p.x + n.x) / 2},${Math.min(p.y,n.y)-35} ${n.x},${n.y}`} fill="none" stroke="#a8cdd8" strokeWidth="1" markerEnd="url(#atlas-dependency-arrow)" strokeDasharray={n.test.verdict === 'BLOCKED' ? '3 5' : undefined} opacity={n.test.verdict === 'BLOCKED' ? '.18' : '.45'}/> : null; }))}
      {model.nodes.map(n => <a key={n.test.id} href={labHref('entidade',n.test.id)} aria-label={`${n.test.name} · ${VERDICT_PT[n.test.verdict]}`} className={sourceCurrent && n.test.status === 'RUNNING' ? 'atlas-node-running' : undefined} style={{opacity: region && region !== n.region ? .16 : 1}}>
        <title>{`${n.test.name} · ${VERDICT_PT[n.test.verdict]}`}</title><circle cx={n.x} cy={n.y} r="7" fill="transparent"/><ellipse cx={n.x} cy={n.y} rx="5" ry="2.5" transform={`rotate(${seed(n.test.id)*180} ${n.x} ${n.y})`} fill={color(n.test, sourceCurrent)} opacity=".55" filter="url(#atlas-glow)"/><circle cx={n.x} cy={n.y} r={sourceCurrent && n.test.status === 'RUNNING' ? 2.5 : 1.4} fill={color(n.test, sourceCurrent)}/>
      </a>)}
    </svg></div>}
    <header className="atlas-title"><p>NEXO / OBSERVATÓRIO</p><h1>ATLAS<span>.</span></h1><p className="atlas-statement">A pesquisa tem uma forma.<br/>Explore suas conexões.</p></header>
    <div className="atlas-instruments"><span className={sourceCurrent ? 'atlas-fresh' : 'atlas-stale'}>{sourceCurrent ? 'LEITURA PUBLICADA' : 'LEITURA DESATUALIZADA'}</span><time>{ago(lab.generatedAt)}</time><button type="button" onClick={onSearch}>Buscar no universo <kbd>⌘ K</kbd></button><button type="button" onClick={onPanel}>Abrir observatório ↗</button></div>
    <nav className="atlas-scales" aria-label="Escala do ATLAS">{([['overview','01','Cosmos'],['research','02','Pesquisa'],['operational','03','Contexto']] as const).map(([id,n,label]) => <button key={id} type="button" aria-pressed={scale === id} onClick={() => changeScale(id)}><small>{n}</small>{label}</button>)}</nav>
    <aside className="atlas-index" aria-label={scale === 'overview' ? 'Regiões de pesquisa' : 'Contexto da pesquisa'}>
      <p className="atlas-eyebrow">{scale === 'overview' ? 'REGIÕES DE PESQUISA' : selected?.name || 'PESQUISAS PUBLICADAS'}</p>
      {scale === 'overview' ? <div className="atlas-regions">{model.regions.map((r,i) => <button key={r.id} type="button" onClick={() => enter(r.id)}><span className="atlas-region-num">{String(i+1).padStart(2,'0')}</span><span><strong>{r.name}</strong><small>{r.tests.length} testes · {r.state}</small></span><span>↗</span></button>)}</div> : <><label className="atlas-filter">Mostrar<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos os estados</option><option value="running" disabled={!sourceCurrent}>{sourceCurrent ? 'Em execução' : 'Execução não verificada'}</option><option value="blocked">Bloqueados</option></select></label><div className="atlas-region-tests">{visibleTests.map(t => <a key={t.id} href={labHref('entidade',t.id)} onFocus={()=>onFocus([t.id])}><span>{t.name}</span><small>{VERDICT_PT[t.verdict]}</small>{scale === 'operational' && <em>{t.blocker || t.meaning || t.question || 'Abra para consultar evidências e execução.'}</em>}</a>)}{!visibleTests.length && <p>{filter === 'running' && !sourceCurrent ? 'Atualize a leitura para verificar execuções.' : 'Nenhum teste neste filtro.'}</p>}</div></>}
    </aside>
    <footer className="atlas-status"><div><strong>{model.regions.length}</strong><span>regiões</span></div><div><strong>{hypothesisCount}</strong><span>hipóteses</span></div><div><strong>{sourceCurrent ? active : '—'}</strong><span>{sourceCurrent ? 'em execução' : 'execução não verificada'}</span></div><div><strong>{blocked}</strong><span>bloqueados</span></div></footer>
    <div className="atlas-key"><span>● execução: pulso · bloqueio: conexão atenuada</span><span>Filamentos: estrutura de pesquisa · setas: dependências</span><p>{fallback ? 'Projeção 2D · WebGL indisponível neste dispositivo.' : 'Arraste para orbitar · role para aproximar · selecione para abrir.'}<br/>Posições representam relações do NEXO, não coordenadas astronômicas.</p></div>
  </section>;
}
