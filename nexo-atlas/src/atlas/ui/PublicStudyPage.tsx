import {requestedQuestion,requestedTestAnchor,studyHref} from '../publicStudyRoutes.ts';
import {metaDescription,syncDocumentHead} from '../documentHead.ts';
import {campaignBrief} from '../publicCampaigns.ts';
import {brandTitle} from '../../i18n/brand.ts';
import {useEffect,useRef,useMemo,useState} from 'react';
import type {Locale} from '../api.ts';
import {pick,type PublicState} from '../publicItems.ts';
import {groupPublicQuestions} from '../publicQuestionGroups.ts';
import PublicQuestionView from './PublicQuestionView.tsx';
import PublicCampaignsView from './PublicCampaignsView.tsx';
import Shell from './Shell.tsx';

export default function PublicStudyPage({pub,locale,refresh}:{pub:PublicState;locale:Locale;refresh:()=>void}){
 const en=locale==='en',params=new URLSearchParams(location.search),question=requestedQuestion(location.pathname,location.search),campaign=params.get('campanha');
 const groups=useMemo(()=>groupPublicQuestions(pub.tests),[pub.tests]);
 const group=question?groups.find(g=>g.id===question):undefined;
 const record=campaign?pub.campaigns?.find(c=>c.id===campaign):undefined;
 const title=group?pick(group.title,locale):record?pick(record.question,locale):pub.status==='loading'?(en?'Loading investigation…':'Carregando investigação…'):(en?'Investigation unavailable':'Investigação indisponível');
 const heading=useRef<HTMLHeadingElement>(null);
 // A `#teste-…` fragment is a direct link to one test: keep it in the address and let the test list open it.
 const [anchor,setAnchor]=useState(()=>requestedTestAnchor(location.hash));
 useEffect(()=>{const sync=()=>setAnchor(requestedTestAnchor(location.hash));window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);};},[]);
 useEffect(()=>{
  const canonical=group?studyHref(group.id):location.pathname;
  if(group&&canonical.startsWith('/pesquisa/')&&(location.pathname!==canonical||location.search||(location.hash&&!anchor)))history.replaceState(null,'',canonical+(anchor?`#${anchor}`:''));
  const brief=group?campaignBrief(group):null;
  syncDocumentHead({title:brandTitle(locale,title),path:canonical.startsWith('/pesquisa/')?canonical:location.pathname,description:brief?metaDescription(pick(brief.summary,locale)):group||record?metaDescription(title):undefined});
  if(pub.status==='ready'&&!anchor){heading.current?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
 },[title,pub.status,locale]);
 return <Shell area="public"><main className="atlas-main atlas-public-main nexo-study-page" id="public-content" tabIndex={-1}>
   <nav className="nexo-study-breadcrumb" aria-label={en?'Breadcrumb':'Caminho de navegação'}><a href="/?retorno=1#/">{en?'Back to research':'Voltar à pesquisa'}</a><span aria-hidden="true">/</span><span aria-current="page">{en?'Investigation':'Investigação'}</span></nav>
   <header className="nexo-study-heading"><p className="atlas-eyebrow">NEXO · {en?'Public research':'Pesquisa pública'}</p><h1 ref={heading} id="study-title" tabIndex={-1}>{title}</h1>{group&&<p>{group.total} {en?(group.total===1?'associated analysis':'associated analyses'):(group.total===1?'análise associada':'análises associadas')}</p>}</header>
   {pub.status==='loading'&&<p role="status">{en?'Loading published evidence…':'Carregando as evidências publicadas…'}</p>}
   {pub.status==='unavailable'&&<div role="alert"><p>{en?'The catalog could not be loaded. Try again.':'Não foi possível carregar o catálogo. Tente novamente.'}</p><button type="button" className="atlas-btn" onClick={refresh}>{en?'Try again':'Tentar novamente'}</button></div>}
   {pub.status==='ready'&&group&&<PublicQuestionView group={group} locale={locale} searching={false} visuals={pub.visuals} standalone openAnchor={anchor}/>}
   {pub.status==='ready'&&record&&<PublicCampaignsView campaigns={pub.campaigns!} locale={locale} generatedAt={pub.generatedAt} coverage={pub.coverage} visuals={pub.visuals}/>}
   {(pub.status==='ready'||pub.status==='empty')&&!group&&!record&&<p>{en?'No study is available at this address in the current catalog. Return to research to explore the available studies.':'Nenhum estudo está disponível neste endereço no catálogo atual. Volte à pesquisa para explorar os estudos disponíveis.'}</p>}
   <footer className="nexo-study-footer"><a href="/?retorno=1#/">{en?'Back to your research view':'Voltar à sua consulta'}</a><a href="/metodo.html">{en?'Methodology':'Metodologia'}</a></footer>
 </main></Shell>;
}
