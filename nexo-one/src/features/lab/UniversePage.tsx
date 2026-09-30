import type { CSSProperties, ReactNode } from 'react';
import type { CosmologyState, CosmologyFrontier, CosmologyEvidence } from '../../contracts/cosmology.ts';
import type { Lab } from './model.ts';
import { labHref } from './routes.ts';

const GLYPH = { SOLID: '✓', TENSION: '◐', OPEN: '○' };
function State({ frontier }: { frontier: CosmologyFrontier }) {
  return <span className={`universe-state state-${frontier.state.toLowerCase()}`}><i aria-hidden="true">{GLYPH[frontier.state]}</i>{frontier.state_label}{frontier.qualification && <small> · {frontier.qualification}</small>}</span>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="hud-section"><h2>{title}</h2>{children}</section>;
}
function Unavailable() {
  return <header className="hud-hero"><p className="hud-kicker">Universo</p><h1>Estado cosmológico atual</h1><p>A síntese cosmológica ainda não foi publicada pela Tower.</p><a href="#/agora">Voltar a Agora →</a></header>;
}
function Evidence({ evidence }: { evidence: CosmologyEvidence }) {
  return <article className="universe-evidence"><a className="elink" href={labHref('entidade', evidence.id)}>{evidence.title}</a><p>{evidence.meaning}</p><small>{evidence.historical ? 'Tower histórica · escopo do contrato preservado' : 'Tower atual'}{!evidence.synthesis_eligible && ' · contexto; não altera o estado'}</small>{evidence.historical && <details><summary>Origem e auditoria</summary>{evidence.source_url && <p><a href={evidence.source_url} target="_blank" rel="noreferrer">Artefato histórico original ↗</a></p>}<pre className="universe-provenance">{JSON.stringify(evidence.provenance, null, 2)}</pre></details>}{(evidence.member_ids?.length ?? 0) > 1 && <details><summary>Resultados agregados</summary>{evidence.member_ids?.map(id => <p key={id}><a href={labHref('entidade', id)}>Abrir teste completo</a></p>)}</details>}</article>;
}
function Constellation({ frontiers }: { frontiers: CosmologyFrontier[] }) {
  return <nav className="universe-map" aria-label="Constelação de frentes cosmológicas">
    <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="33"/><circle cx="50" cy="50" r="15"/>{frontiers.map((f, i) => { const a = 2 * Math.PI * i / frontiers.length - Math.PI / 2; return <line key={f.id} x1="50" y1="50" x2={50 + 34 * Math.cos(a)} y2={50 + 34 * Math.sin(a)}/>; })}</svg>
    <div className="universe-map-core"><span>NEXO</span><strong>Universo</strong><small>Síntese atual</small></div>
    {frontiers.map((f, i) => { const a = 2 * Math.PI * i / frontiers.length - Math.PI / 2; return <a key={f.id} className={`universe-star state-${f.state.toLowerCase()}`} href={labHref('universo', f.id)} style={{ '--star-x': `${50 + 35 * Math.cos(a)}%`, '--star-y': `${50 + 35 * Math.sin(a)}%` } as CSSProperties}><i aria-hidden="true">{GLYPH[f.state]}</i><span>{f.title}</span><small>{f.state_label}</small></a>; })}
  </nav>;
}
export function UniversePage({ cosmology }: { cosmology?: CosmologyState | null }) {
  if (!cosmology?.frontiers.length) return <Unavailable />;
  return <div className="universe-page">
    <div className="universe-intro"><header className="hud-hero"><p className="hud-kicker">Universo · síntese da Tower</p><h1>Estado cosmológico atual</h1><p className="hud-lead">Síntese do que permanece sólido, do que está em tensão e do que continua aberto.</p><p>Literatura, evidência NEXO e síntese atual, com o caminho até cada resultado.</p><div className="universe-legend"><span>✓ Sólido</span><span>◐ Tensão</span><span>○ Aberto</span></div></header><Constellation frontiers={cosmology.frontiers}/></div>
    <div className="universe-cards">{cosmology.frontiers.map(f => <article className="hud-card universe-card" key={f.id}>
      <a className="universe-card-link" href={labHref('universo', f.id)}><h2>{f.title}</h2><State frontier={f}/><p>{f.summary}</p></a>
      <p className="hud-meta">{f.key_evidence.length} evidências relevantes · {f.evidence_counts.confirmed} confirmadas · {f.evidence_counts.refuted} refutadas · {f.evidence_counts.review} em disputa</p>
      <h3>Principal questão aberta</h3><p>{f.open_questions[0] ?? 'Não publicada.'}</p><h3>Próximo discriminante</h3><p>{f.next_discriminants[0] ?? 'Não publicado.'}</p><a className="universe-more" href={labHref('universo', f.id)}>Explorar frente →</a>
    </article>)}</div>
  </div>;
}
export function UniverseFrontierPage({ cosmology, lab, id }: { cosmology?: CosmologyState | null; lab: Lab; id: string }) {
  if (!cosmology) return <Unavailable />;
  const f = cosmology.frontiers.find(item => item.id === id);
  if (!f) return <header className="hud-hero"><h1>Frente não publicada</h1><a href="#/universo">Voltar ao Universo →</a></header>;
  return <div className="universe-detail"><header className="hud-hero"><p className="hud-kicker"><a href="#/universo">Universo</a> / {f.title}</p><h1>{f.title}</h1><State frontier={f}/></header>
    <Section title="Estado atual"><p className="hud-lead">{f.summary}</p><p>{f.why}</p><p className="hud-meta">Confiança: {f.confidence}</p>{f.synthesis_evidence_ids.map(ref => <p key={ref}><a href={labHref('entidade', ref)}>Evidência da síntese →</a></p>)}</Section>
    <Section title="O que sabemos"><h3>Literatura</h3><p>{f.literature_baseline}</p>{f.literature_source && <p><a href={f.literature_source.url} target="_blank" rel="noreferrer">{f.literature_source.name} · baseline de orientação ↗</a></p>}<h3>Evidência NEXO</h3>{f.nexo_interpretation.length ? f.nexo_interpretation.map((claim, i) => <div key={i} className="universe-claim"><p>{claim.text}</p>{claim.evidence_ids.map(ref => <a key={ref} className="elink" href={labHref('entidade', ref)}>Ver teste e evidência →</a>)}</div>) : <p>Não há resultado terminal material publicado para alterar esta leitura. Isso não é uma refutação.</p>}</Section>
    <Section title="Evidência do NEXO">{([['CONFIRMED', 'Confirmados'], ['REFUTED', 'Refutados'], ['REVIEW', 'Em disputa'], ['INCONCLUSIVE', 'Inconclusivos relevantes']] as const).map(([verdict, label]) => <div className="universe-evidence-group" key={verdict}><h3>{label}</h3>{f.key_evidence.filter(e => e.verdict === verdict).length ? f.key_evidence.filter(e => e.verdict === verdict).map(e => <Evidence key={e.id} evidence={e}/>) : <p className="hud-muted">Nenhum resultado material publicado nesta categoria.</p>}</div>)}</Section>
    <Section title="O que a Tower antiga ensinou">{f.historical_lessons.length ? f.historical_lessons.map(e => <div key={e.id}><Evidence evidence={e}/>{e.superseded_by_current && <p>A Tower atual tem precedência: o resultado anterior permanece como registro histórico.</p>}</div>) : <p>Nenhum resultado histórico material selecionado para esta frente.</p>}</Section>
    <Section title="O que poderia mudar o estado"><ul className="universe-questions">{f.open_questions.map(q => <li key={q}>{q}</li>)}</ul><h3>Próximos discriminantes</h3><ul className="universe-questions">{f.next_discriminants.map(q => <li key={q}>{q}</li>)}</ul>{f.active_tests.length > 0 && <details><summary>Testes atuais que podem mudar a conclusão ({f.active_tests.length})</summary><ul className="universe-questions">{f.active_tests.map(t => <li key={t.id}><a href={labHref('entidade', t.id)}>{t.title}</a></li>)}</ul></details>}</Section>
    <Section title="Campanhas relacionadas">{f.campaign_ids.map(cid => <p key={cid}><a href={labHref('entidade', cid)}>{lab.campaigns.get(cid)?.title ?? lab.campaigns.get(cid)?.questionPlain ?? 'Explorar campanha' } →</a></p>)}{f.roadmap_ids.map(rid => <p key={rid}><a href={labHref('roadmap', rid)}>{lab.roadmaps.get(rid)?.title ?? 'Explorar roadmap'} →</a></p>)}{!f.campaign_ids.length && !f.roadmap_ids.length && <p>Nenhuma campanha atual relacionada publicada.</p>}</Section>
    <Section title="Explorar evidência"><p><a href="#/evidencia">Abrir todos os testes atuais no Observatório →</a></p><p><a href="#/roadmaps">O que estamos tentando descobrir agora →</a></p></Section>
  </div>;
}
