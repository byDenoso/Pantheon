import {lazy, Suspense, useState, type ReactNode} from 'react';
import type {Lang} from '../i18n/state-language.ts';
import {retrievalTransport, retrievalSyncTransport} from '../private-legacy/install.ts';
import {frameMessage, postToParent} from '../private-legacy/state.ts';
import RetrievalPanel from './RetrievalPanel.tsx';
import {RETRIEVAL_COPY} from './retrieval-copy.ts';
const MemoryBrowseView = lazy(() => import('./MemoryBrowseView.tsx'));
/** The source browser and its full Tower read are mounted only after an explicit choice. */
export default function MemoryView({lang,bridge}:{lang:Lang;bridge?:ReactNode}) {
  const [view,setView] = useState<'search'|'browse'>('search'), m=RETRIEVAL_COPY[lang];
  return <><nav className="pr-switch" aria-label={m.views}><button type="button" className="pw-button" aria-pressed={view==='search'} onClick={()=>setView('search')}>{m.findView}</button><button type="button" className="pw-button" aria-pressed={view==='browse'} aria-describedby="pr-browse-help" onClick={()=>setView('browse')}>{m.browseView}</button><p id="pr-browse-help" className="pw-muted">{m.browseHelp}</p></nav>
    {view==='search' ? <RetrievalPanel lang={lang} bridge={bridge} read={retrievalTransport} sync={retrievalSyncTransport} onUnauthorized={()=>postToParent(frameMessage.logout())}/> : <Suspense fallback={<p className="pw-page" role="status">{m.opening}</p>}><MemoryBrowseView lang={lang} bridge={bridge}/></Suspense>}
  </>;
}
