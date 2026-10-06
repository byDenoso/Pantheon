import {lazy, Suspense, useEffect, useState} from 'react';
import {loadPublic, pick, type PublicState} from '../publicItems.ts';
import {ApiError} from '../api.ts';
import {CONTACT_EMAIL, PRESENTATION} from '../../i18n/presentation.ts';
import {useLocale, useMessages} from './LocaleProvider.tsx';
import PublicTestView from './PublicTestView.tsx';
import Shell from './Shell.tsx';
import {goToPublicSection} from '../publicNavigation.ts';
import '../public-presentation.css';

const CosmicWebCanvas = lazy(() => import('./CosmicWebCanvas.tsx'));
const art = new URL('../assets/cosmic-web.png', import.meta.url).href;

export default function PublicApp() {
  const m = useMessages();
  const locale = useLocale();
  const t = PRESENTATION[locale];
  const [pub, setPub] = useState<PublicState>({status: 'loading', items: [], tests: []});

  useEffect(() => { document.title = m.heroTitle; }, [m.heroTitle]);
  useEffect(() => {
    const ac = new AbortController();
    loadPublic((u, i) => fetch(u, i), ac.signal).then(s => { if (!ac.signal.aborted) setPub(s); })
      .catch(e => { if (!ac.signal.aborted && !(e instanceof ApiError && e.code === 'ABORTED')) setPub({status: 'unavailable', items: [], tests: []}); });
    return () => ac.abort();
  }, []);

  return (
    <Shell area="public">
      <main className="atlas-main atlas-public-main" id="public-content">
        <section className="atlas-hero" aria-labelledby="public-title">
          <div className="atlas-hero-copy">
            <p className="atlas-eyebrow">{t.hero.eyebrow}</p>
            <h1 id="public-title">{t.hero.title.map(line => <span key={line}>{line}</span>)}</h1>
            <p className="atlas-hero-lead">{m.heroLead}</p>
            <div className="atlas-hero-actions">
              <button type="button" className="atlas-btn" onClick={() => goToPublicSection('lines')}>{t.hero.research}<span aria-hidden="true">→</span></button>
              <button type="button" className="atlas-text-action" onClick={() => goToPublicSection('methods')}>{t.hero.methods}<span aria-hidden="true">→</span></button>
            </div>
          </div>
          <figure className="atlas-hero-art">
            <div className="atlas-hero-picture">
              <img className="atlas-web-art" src={art} width="1672" height="941" alt="" fetchPriority="high"/>
              <div className="atlas-web-motion" aria-hidden="true"><Suspense fallback={null}><CosmicWebCanvas label={m.vizLabel}/></Suspense></div>
            </div>
            <figcaption className="atlas-note">{m.vizNote}</figcaption>
          </figure>
        </section>

        <section className="atlas-section" id="s-lines" tabIndex={-1} aria-labelledby="h-lines">
          <p className="atlas-eyebrow"><span aria-hidden="true">01 / </span>{t.lines.label}</p>
          <h2 id="h-lines">{t.lines.title}</h2>
          <ol className="atlas-research-lines">{t.lines.items.map((line, i) => (
            <li key={line.id} data-line={line.id}><span className="atlas-line-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><h3>{line.title}</h3><p>{line.body}</p></li>
          ))}</ol>
        </section>

        <section className="atlas-section atlas-method-section" id="s-methods" tabIndex={-1} aria-labelledby="h-methods">
          <div className="atlas-method-intro">
            <p className="atlas-eyebrow"><span aria-hidden="true">02 / </span>{t.methods.label}</p>
            <h2 id="h-methods">{t.methods.title}</h2>
            <p className="atlas-lead">{t.methods.lead}</p>
          </div>
          <ol className="atlas-steps">{t.methods.steps.map((step, i) => <li key={step.title}><span className="atlas-line-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        </section>

        <section className="atlas-section" id="s-works" tabIndex={-1} aria-labelledby="h-works">
          <p className="atlas-eyebrow"><span aria-hidden="true">03 / </span>{t.works.label}</p>
          <h2 id="h-works">{t.works.title}</h2>
          <div className="atlas-items" aria-live="polite" data-status={pub.status}>
            {pub.status === 'loading' && <p>{m.loading}</p>}
            {pub.status === 'unavailable' && <p className="atlas-empty">{m.unavailable}</p>}
            {pub.status === 'empty' && <p className="atlas-empty">{m.emptyTitle}</p>}
            {pub.status === 'ready' && pub.tests.map(test => <PublicTestView key={test.id} test={test} locale={locale}/>)}
            {pub.status === 'ready' && pub.items.map(it => (
              <article key={it.id} className="atlas-item">
                <span className="atlas-kind">{m.kinds[it.kind]}</span>
                <h3>{pick(it.title, locale)}</h3>
                <p>{pick(it.plain, locale)}</p>
                <details><summary>{m.technicalLabel}</summary><p>{pick(it.technical, locale)}</p></details>
                {it.credit && <small>{m.creditLabel}: {it.credit}</small>}
              </article>
            ))}
          </div>
        </section>

        <section className="atlas-section atlas-contact-section" id="s-contact" tabIndex={-1} aria-labelledby="h-contact">
          <p className="atlas-eyebrow"><span aria-hidden="true">04 / </span>{t.contact.label}</p>
          <h2 id="h-contact">{t.contact.title}</h2>
          <p>{t.contact.body}</p>
          <a className="atlas-mail" href={`mailto:${CONTACT_EMAIL}`} aria-label={`${t.contact.action} ${CONTACT_EMAIL}`}>{CONTACT_EMAIL}<span aria-hidden="true">↗</span></a>
        </section>
      </main>
      <footer className="atlas-footer"><div className="atlas-footer-in"><strong>NEXO</strong><p>{t.footer.note}</p><a href={`mailto:${CONTACT_EMAIL}`}>{t.contact.title}</a></div></footer>
    </Shell>
  );
}
