import {useEffect,useRef} from 'react';
import type {Locale} from '../api.ts';
import {pick, type PublicTest} from '../publicItems.ts';
import {PRESENTATION} from '../../i18n/presentation.ts';
import PublicVisualGallery from './LazyVisualGallery.tsx';
import type {PublicVisual} from '../publicVisuals.ts';

/** Four reviewed fields only. No operational status is interpreted as a scientific result. */
export default function PublicTestView({test, locale,visuals=[],standalone=false,anchor,requested=false}: {test: PublicTest; locale: Locale;visuals?:PublicVisual[];standalone?:boolean;anchor?:string;requested?:boolean}) {
  const article=useRef<HTMLElement>(null);
  useEffect(()=>{const el=article.current;if(!requested||!el)return;const frame=requestAnimationFrame(()=>{el.scrollIntoView({block:'start',behavior:'instant'});el.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);},[requested]);
  const labels = PRESENTATION[locale].test;
  const en = locale === 'en';
  const date = (value: string) => new Intl.DateTimeFormat(en ? 'en-GB' : 'pt-BR', {dateStyle: 'medium', timeZone: 'America/Sao_Paulo'}).format(new Date(value));
  return (
    <article ref={article} id={anchor} tabIndex={anchor?-1:undefined} className="atlas-public-test" aria-label={pick(test.question, locale)}>
      <div className="atlas-public-test-dates">
        {test.published_at ? <span>{en ? 'Published on' : 'Publicado em'} <time dateTime={test.published_at}>{date(test.published_at)}</time></span> : <span>{en ? 'Publication date unavailable' : 'Data de publicação indisponível'}</span>}
        {test.updated_at && test.updated_at !== test.published_at && <span>{en ? 'Updated on' : 'Atualizado em'} <time dateTime={test.updated_at}>{date(test.updated_at)}</time></span>}
      </div>
      <dl>
        <div><dt>{labels.question}</dt><dd><p className="atlas-original-question">{pick(test.question, locale)}</p></dd></div>
        <div><dt>{en ? 'Method overview' : 'Abordagem'}</dt><dd>{pick(test.method, locale)}</dd></div>
        <div className="nexo-reviewed-result"><dt>{labels.result}</dt><dd>{pick(test.result, locale)}</dd></div>
        <div><dt>{en ? 'Scope and limits' : 'Alcance e limites'}</dt><dd>{pick(test.answers, locale)}</dd></div>
      </dl>
      {visuals.length>0&&<PublicVisualGallery visuals={visuals} locale={locale} compact headingLevel={standalone?3:4}/>}
    </article>
  );
}
