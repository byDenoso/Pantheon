import {requestedQuestion} from '../publicStudyRoutes.ts';
import PublicStudyPage from './PublicStudyPage.tsx';
import {useExplorerState} from './useExplorerState.ts';
import {useCatalogPosition} from './useCatalogPosition.ts';
import ArrowIcon from './ArrowIcon.tsx';
import PublicCampaignsView from './PublicCampaignsView.tsx';
import '../canonical-campaigns.css';
import {lazy, Suspense, useEffect, useState} from 'react';
import {pick} from '../publicItems.ts';
import usePublicResearch from './usePublicResearch.ts';
import PublicResearchHub from './PublicResearchHub.tsx';
import ResearchLaunch from './ResearchLaunch.tsx';
import {CONTACT_EMAIL, PRESENTATION} from '../../i18n/presentation.ts';
import {useLocale, useMessages} from './LocaleProvider.tsx';
import PublicTestList from './PublicTestList.tsx';
import Shell from './Shell.tsx';
import {CosmologicalHero} from './CosmologicalBackdrop.tsx';
import {goToPublicSection} from '../publicNavigation.ts';
import '../public-presentation.css';
import '../site-living.css';
import '../game-motion.css';
import '../public-refinement.css';

const CosmicWebCanvas = lazy(() => import('./CosmicWebCanvas.tsx'));
const art = new URL('../assets/cosmic-web.png', import.meta.url).href;

export default function PublicApp() {
  const m = useMessages();
  const locale = useLocale();
  const t = PRESENTATION[locale];
  const {pub,checking,pending,checkedAt,refresh}=usePublicResearch();
  const hasRequestedStudy=Boolean(requestedQuestion(window.location.pathname,window.location.search)||new URLSearchParams(window.location.search).get('campanha'));
  const [savedTab,setResearchTab]=useExplorerState<string>('tab','map');
  const researchTab=['map','figures','updates','compare'].includes(savedTab)?savedTab:'map';
  const [catalogOpen,setCatalogOpen]=useExplorerState<boolean>('catalog.open',false);
  useCatalogPosition(pub.status==='ready',hasRequestedStudy);
  const explore=(tab:string)=>{setResearchTab(tab);goToPublicSection('works');};

  useEffect(() => { if(!hasRequestedStudy)document.title = m.heroTitle; }, [m.heroTitle,hasRequestedStudy]);
  if(hasRequestedStudy)return <PublicStudyPage pub={pub} locale={locale} refresh={refresh}/>;

  return (
    <Shell area="public">
      <main className="atlas-main atlas-public-main" id="public-content" tabIndex={-1}>
        <section className="atlas-hero" aria-labelledby="public-title">
          <div className="atlas-hero-copy">
            <p className="atlas-eyebrow">{t.hero.eyebrow}</p>
            <h1 id="public-title">{t.hero.title.map(line => <span key={line}>{line}</span>)}</h1>
            <p className="atlas-hero-lead">{m.heroLead}</p>
            <div className="atlas-hero-actions">
              <button type="button" className="atlas-btn" onClick={() => goToPublicSection('works')}>{t.hero.research}<ArrowIcon direction="right"/></button>
              <button type="button" className="atlas-text-action" onClick={() => goToPublicSection('methods')}>{t.hero.methods}<ArrowIcon direction="right"/></button>
            </div>
          </div>
          <CosmologicalHero fallback={<figure className="atlas-hero-art">
            <div className="atlas-hero-picture">
              <img className="atlas-web-art" src={art} width="1672" height="941" alt="" fetchPriority="high"/>
              <div className="atlas-web-motion" aria-hidden="true"><Suspense fallback={null}><CosmicWebCanvas label={m.vizLabel}/></Suspense></div>
            </div>
            <figcaption className="atlas-note">{m.vizNote}</figcaption>
          </figure>}/>
          <ResearchLaunch pub={pub} locale={locale} explore={explore}/>
        </section>

        <div className="atlas-public-content">
        <section className="atlas-section" id="s-works" tabIndex={-1} aria-labelledby="h-works">
          <div className="nexo-section-heading"><div>
          <p className="atlas-eyebrow"><span aria-hidden="true">01 / </span>{t.works.label}</p>
          <h2 id="h-works">{t.works.title}</h2>
          </div><p className="nexo-section-lead">{t.works.lead}</p></div>
          {pub.status==='ready'&&<PublicResearchHub pub={pub} locale={locale} checking={checking} pending={pending} checkedAt={checkedAt} refresh={refresh} activeTab={researchTab} onTabChange={setResearchTab}/>}
          {pub.status!=='ready'&&<div className="nexo-public-state atlas-items" data-status={pub.status} aria-busy={pub.status==='loading'}>
            <span className="nexo-state-symbol" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4" stroke="currentColor" strokeWidth="1.2"/></svg></span>
            <div role="status">
              {pub.status === 'loading' && <><p>{m.loading}</p><div className="nexo-public-skeleton" aria-hidden="true"><span/><span/></div></>}
              {pub.status === 'unavailable' && <p className="atlas-empty">{m.unavailable}</p>}
              {pub.status === 'empty' && <p className="atlas-empty">{m.emptyTitle}</p>}
              {pub.status === 'empty' && <p className="nexo-state-detail">{m.emptyBody}</p>}
              {pub.status==='unavailable'&&<button type="button" className="atlas-text-action nexo-state-retry" disabled={checking} onClick={refresh}>{locale==='en'?'Try again':'Tentar novamente'}<ArrowIcon direction="right"/></button>}
            </div>
          </div>}
          {pub.status==='ready'&&<>
          <details className="nexo-study-catalog" open={catalogOpen} onToggle={event=>setCatalogOpen(event.currentTarget.open)}>
          <summary>{locale==='en'?'Browse all published studies':'Explorar todos os estudos publicados'} <span aria-hidden="true">+</span></summary>
          <div className="atlas-items" aria-live="polite" data-status={pub.status}>
            {catalogOpen&&<>
            {pub.status === 'ready' && pub.campaigns !== undefined && pub.campaigns.length > 0 && <PublicCampaignsView campaigns={pub.campaigns} locale={locale} generatedAt={pub.generatedAt} coverage={pub.coverage} visuals={pub.visuals}/>}
            {pub.status==='ready'&&pub.campaigns?.length===0&&<p>{locale==='en'?'The investigations are awaiting publication of an update.':'As investigações aguardam a publicação de uma atualização.'}</p>}
            {pub.status === 'ready' && pub.campaigns === undefined && pub.tests.length > 0 && <h3>{locale === 'pt-BR' ? 'Resultados publicados' : 'Published results'}</h3>}
            {pub.status === 'ready' && pub.campaigns === undefined && pub.tests.length > 0 && <PublicTestList tests={pub.tests} locale={locale} visuals={pub.visuals}/>}
            {pub.status === 'ready' && pub.items.map(it => (
              <article key={it.id} className="atlas-item">
                <span className="atlas-kind">{m.kinds[it.kind]}</span>
                <h3>{pick(it.title, locale)}</h3>
                <p>{pick(it.plain, locale)}</p>
                <details><summary>{m.technicalLabel}</summary><p>{pick(it.technical, locale)}</p></details>
                {it.credit && <small>{m.creditLabel}: {it.credit}</small>}
              </article>
            ))}
            </>}
          </div>
          </details>
          </>}
        </section>

        <section className="atlas-section" id="s-lines" tabIndex={-1} aria-labelledby="h-lines">
          <p className="atlas-eyebrow"><span aria-hidden="true">02 / </span>{t.lines.label}</p>
          <h2 id="h-lines">{t.lines.title}</h2>
          <ol className="atlas-research-lines">{t.lines.items.map((line, i) => (
            <li key={line.id} data-line={line.id}><span className="atlas-line-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><h3>{line.title}</h3><p>{line.body}</p></li>
          ))}</ol>
        </section>

        <section className="atlas-section atlas-method-section" id="s-methods" tabIndex={-1} aria-labelledby="h-methods">
          <div className="atlas-method-intro">
            <p className="atlas-eyebrow"><span aria-hidden="true">03 / </span>{t.methods.label}</p>
            <h2 id="h-methods">{t.methods.title}</h2>
            <p className="atlas-lead">{t.methods.lead}</p><a className="nexo-method-link" href="/metodo.html">{locale==='en'?'Read the full methodology':'Ler a metodologia completa'} <ArrowIcon direction="right"/></a>
          </div>
          <ol className="atlas-steps">{t.methods.steps.map((step, i) => <li key={step.title}><span className="atlas-line-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        </section>

        <section className="atlas-section atlas-contact-section" id="s-contact" tabIndex={-1} aria-labelledby="h-contact">
          <div className="nexo-contact-heading">
          <p className="atlas-eyebrow"><span aria-hidden="true">04 / </span>{t.contact.label}</p>
          <h2 id="h-contact">{t.contact.title}</h2>
          </div><div className="nexo-contact-copy">
          <p>{t.contact.body}</p>
          <a className="atlas-mail" href={`mailto:${CONTACT_EMAIL}`} aria-label={`${t.contact.action} ${CONTACT_EMAIL}`}>{CONTACT_EMAIL}<ArrowIcon/></a>
          </div>
        </section>
        </div>
      </main>
      <footer className="atlas-footer"><div className="atlas-footer-in"><div className="nexo-footer-brand"><strong>NEXO</strong><p>{t.footer.note}</p></div><nav className="nexo-footer-nav" aria-label={t.footer.sections}/><a href={`mailto:${CONTACT_EMAIL}`}>{t.contact.title}<ArrowIcon/></a></div></footer>
    </Shell>
  );
}
