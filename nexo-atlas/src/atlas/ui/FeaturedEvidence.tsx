import {useMemo} from 'react';
import type {Locale} from '../api.ts';
import {pick, type PublicState} from '../publicItems.ts';
import {visualLinks} from '../researchExplorer.ts';
import InteractivePlot from './InteractivePlot.tsx';
import ArrowIcon from './ArrowIcon.tsx';

/** Reuses the first published scientific figure, including its original scope and values. */
export default function FeaturedEvidence({pub, locale}: {pub: PublicState; locale: Locale}) {
  const en = locale === 'en';
  const visual = useMemo(() => pub.visuals?.find(v => v.evidenceKind === 'SCIENTIFIC_RESULT' && v.plot), [pub.visuals]);
  const href = useMemo(() => visual ? visualLinks([visual], pub)[visual.id]?.href : undefined, [visual, pub]);
  return <aside className="nexo-featured-evidence" aria-labelledby="featured-evidence-title" aria-busy={pub.status === 'loading'}>
    <div className="nexo-evidence-kicker"><span className="atlas-eyebrow">{en ? 'From the research catalog' : 'Do catálogo científico'}</span><span aria-hidden="true">↗</span></div>
    {visual?.plot ? <>
      <h2 id="featured-evidence-title">{pick(visual.title, locale)}</h2>
      <InteractivePlot key={`${visual.id}:${locale}`} plot={visual.plot} title={pick(visual.title, locale)} locale={locale}/>
      <p className="nexo-featured-caption">{pick(visual.caption, locale)}</p>
      {visual.limitations.length > 0 && <details className="nexo-featured-limits"><summary>{en ? 'Scope and limitations' : 'Escopo e limites'}</summary><ul>{visual.limitations.map((limit, i) => <li key={i}>{pick(limit, locale)}</li>)}</ul></details>}
      {href && <a className="nexo-evidence-source" href={href}>{en ? 'Read the investigation' : 'Ler a investigação'}<ArrowIcon direction="right"/></a>}
    </> : <>
      <h2 id="featured-evidence-title">{en ? 'Questions. Models. Evidence.' : 'Perguntas. Modelos. Evidências.'}</h2>
      <p>{en ? 'Explore the research questions, published results and the methods behind each analysis.' : 'Explore as perguntas de pesquisa, os resultados publicados e os métodos de cada análise.'}</p>
      <a className="nexo-evidence-source" href="#s-works">{en ? 'Explore the catalog' : 'Explorar o catálogo'}<ArrowIcon direction="right"/></a>
    </>}
  </aside>;
}
