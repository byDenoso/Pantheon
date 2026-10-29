import {useMemo} from 'react';
import type {Locale} from '../api.ts';
import type {PublicVisual} from '../publicVisuals.ts';
import {groupPublicVisuals,type VisualGroup,type VisualLink} from '../publicVisualGroups.ts';
import ComparisonFigure from './ComparisonFigure.tsx';

/**
 * Figures at the level of one investigation. Only the reviewed comparison groups are
 * shown here: analyses that publish the same metric share a figure, every other
 * figure stays with its own test below. No value is recomputed, averaged or combined.
 * `groups` lets a synthetic fixture supply prepared groups; the app passes visuals.
 */
export default function QuestionFigures({visuals,links,locale,groups}:{visuals:PublicVisual[];links:Record<string,VisualLink>;locale:Locale;groups?:VisualGroup[]}){
 const en=locale==='en';
 const comparisons=useMemo(()=>(groups??groupPublicVisuals(visuals)).filter(group=>group.plot),[groups,visuals]);
 if(!comparisons.length)return null;
 return <section className="nexo-question-figures" aria-labelledby="question-figures-title">
  <h2 id="question-figures-title">{en?'Comparable figures in this investigation':'Figuras comparáveis desta investigação'}</h2>
  <p className="nexo-question-figures-note">{en?'Only analyses that publish the same metric share a figure. Each value keeps its own configuration and source; nothing is averaged or combined.':'Só análises que publicam a mesma métrica compartilham uma figura. Cada valor mantém sua configuração e sua fonte; nada é combinado nem tirado em média.'}</p>
  <div className="nexo-gallery-grid nexo-question-figures-grid">{comparisons.map(group=><ComparisonFigure key={group.id} group={group} locale={locale} links={links} headingLevel={3}/>)}</div>
 </section>;
}
