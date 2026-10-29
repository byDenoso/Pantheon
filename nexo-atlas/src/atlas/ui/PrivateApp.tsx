import {lazy, Suspense, useState, useEffect, useCallback, useRef, type FormEvent} from 'react';
import {useLocale, useMessages} from './LocaleProvider.tsx';
import {usePrivateSession} from './usePrivateSession.ts';
import Shell from './Shell.tsx';
import {loadAutonomyStatus} from '../autonomy.ts';
import ResearchAutonomyPanel from './ResearchAutonomyPanel.tsx';
import './private-area.css';

// The existing Atlas screens run inside a guarded same-origin frame (see PrivateFrame).
const PrivateFrame = lazy(() => import('./PrivateFrame.tsx'));
const MAX_FRAME_FAILURES = 2;

function PrivateArea({onFrameError, onFrameReady}: {onFrameError: (code: string) => void; onFrameReady: () => void}) {
  const m = useMessages(); const locale = useLocale();
  const {state, login, logout, retryRevocation, retrySource} = usePrivateSession();
  const [pin, setPin] = useState('');
  const [showAutonomy, setShowAutonomy] = useState(false);
  const [retryWait, setRetryWait] = useState(0);
  const retrySourceRef = useRef(retrySource); retrySourceRef.current = retrySource;
  const loadAutonomy = useCallback(async (signal: AbortSignal) => {
    try { return await loadAutonomyStatus(signal); }
    catch(error) {
      // The existing controller immediately wipes private state while revalidating.
      // Never send a compensating DELETE that could revoke a newer session.
      if(!signal.aborted && error instanceof Error && error.message === 'AUTH_REQUIRED') void retrySourceRef.current();
      throw error;
    }
  }, []);
  useEffect(() => { if(state.phase !== 'authenticated') setShowAutonomy(false); }, [state.phase]);
  const sourceNotice = ['source_unavailable', 'drive_consent', 'drive_unavailable'].includes(state.notice ?? '');
  useEffect(() => {
    if (!sourceNotice || !state.retryAfter) { setRetryWait(0); return; }
    const deadline = Date.now() + state.retryAfter * 1000;
    let timer: number | undefined;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRetryWait(remaining);
      if (!remaining && timer !== undefined) window.clearInterval(timer);
    };
    update();
    timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [sourceNotice, state.notice, state.retryAfter]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = pin;
    setPin(''); // never keep the code in component state after submit
    void login(v);
  };
  const busy = state.phase === 'authenticating' || state.revocation === 'pending';
  const noticeText = state.notice === 'rate_limited' && state.retryAfter ? m.rateLimited(state.retryAfter) : state.notice ? m.notices[state.notice] : null;
  const revText = state.revocation === 'pending' ? m.revPending : state.revocation === 'revoked' ? m.revRevoked : state.revocation === 'unconfirmed' ? m.revUnconfirmed : null;
  const live = state.phase === 'authenticated';
  // The accessible name is always the full label; narrow screens show a one-word form of it.
  const autonomyLabel = showAutonomy ? (locale === 'en' ? 'Back to Atlas' : 'Voltar ao Atlas') : (locale === 'en' ? 'Research autonomy' : 'Autonomia da pesquisa');

  return (
    <main className={`atlas-main private-root${live ? ' has-frame' : ''}`}>
      <div className="atlas-row atlas-session-bar">
        <div><h1>{m.privateTitle}</h1>
          {live && state.expiresAt && <p className="atlas-session-expiry"><span>{m.expires} </span><time dateTime={state.expiresAt} title={new Date(state.expiresAt).toLocaleString(locale)}>{new Date(state.expiresAt).toLocaleTimeString(locale, {hour: '2-digit', minute: '2-digit'})}</time></p>}
        </div>
        {live && <div className="atlas-private-actions"><button type="button" className="atlas-btn" disabled={!state.data} aria-pressed={showAutonomy} aria-label={autonomyLabel} onClick={() => setShowAutonomy(v => !v)}><span className="atlas-label-full">{autonomyLabel}</span><span className="atlas-label-short" aria-hidden="true">{showAutonomy ? 'Atlas' : (locale === 'en' ? 'Autonomy' : 'Autonomia')}</span></button><button type="button" className="atlas-btn" onClick={() => void logout()}>{m.signOut}</button></div>}
      </div>
      {state.phase === 'checking' && <p className="atlas-private-check" role="status"><span className="atlas-private-loader" aria-hidden="true"/>{m.checking}</p>}
      {revText && <p role="status" className={state.revocation === 'unconfirmed' ? 'atlas-warn' : undefined}>{revText}{' '}
        {state.revocation === 'unconfirmed' && <button type="button" className="atlas-btn" onClick={() => void retryRevocation()}>{m.revRetry}</button>}</p>}
      {state.phase === 'signedOut' && sourceNotice && <section className="atlas-private-recovery" aria-labelledby="atlas-private-recovery-title"><span className="atlas-private-orbit" aria-hidden="true">◎</span><h2 id="atlas-private-recovery-title">{state.notice === 'drive_consent' ? locale === 'en' ? 'Reconnect the research source' : 'Reconecte a fonte da pesquisa' : locale === 'en' ? 'The research source is unavailable' : 'A fonte da pesquisa está indisponível'}</h2><p role="alert">{noticeText}</p>
        <p className="atlas-note">{locale === 'en' ? 'Progress and next steps cannot be confirmed while the source is unavailable.' : 'O progresso e os próximos passos não podem ser confirmados enquanto a fonte estiver indisponível.'}</p>
        {state.notice === 'drive_consent' && <><p className="atlas-note">{locale === 'en' ? 'Renew your Google Drive connection, then return here to check access to the research source.' : 'Renove a conexão com o Google Drive e volte aqui para conferir o acesso à fonte da pesquisa.'}</p><a className="atlas-btn" href={'/signin-with-chatgpt?return_to=' + encodeURIComponent('/#/privado')} target="_top">{locale === 'en' ? 'Reconnect Google Drive' : 'Reconectar Google Drive'}</a></>}
        <div className="atlas-private-recovery-actions"><button type="button" className="atlas-btn" disabled={busy || retryWait > 0} onClick={() => { if (state.notice === 'source_unavailable') void retrySource(); else window.location.reload(); }}>{retryWait > 0 ? locale === 'en' ? `Try again in ${retryWait}s` : `Tentar novamente em ${retryWait}s` : locale === 'en' ? 'Check connection again' : 'Verificar conexão novamente'}</button><button type="button" className="atlas-btn atlas-private-secondary" disabled={busy} onClick={() => void logout()}>{m.signOut}</button></div></section>}
      {state.phase !== 'authenticated' && state.phase !== 'checking' && !sourceNotice && (
        <div className="atlas-private-gate"><div className="atlas-private-gate-copy"><span className="atlas-private-orbit" aria-hidden="true">◎</span><h2>{locale === 'en' ? 'Explore the research' : 'Explore a pesquisa'}</h2><p>{locale === 'en' ? 'Follow the web of tests, inspect the evidence and review current operations.' : 'Acompanhe a teia de testes, examine as evidências e revise a operação atual.'}</p><div className="atlas-private-gate-topics"><span>{locale === 'en' ? 'Domains' : 'Domínios'}</span><span>{locale === 'en' ? 'Tests' : 'Testes'}</span><span>{locale === 'en' ? 'Memory' : 'Memória'}</span></div></div>
        <form onSubmit={submit} className="atlas-form atlas-private-login" autoComplete="off" aria-busy={busy}>
          <p className="atlas-private-login-lead">{m.privateLead}</p>
          <label htmlFor="atlas-pin">{m.pinLabel}</label>
          <input id="atlas-pin" type="password" value={pin} onChange={e => setPin(e.target.value)} minLength={8} maxLength={128} autoComplete="off" autoCapitalize="none" spellCheck={false} required disabled={busy} aria-invalid={state.notice === 'invalid' || undefined} aria-describedby={`atlas-pin-hint${noticeText ? ' atlas-pin-notice' : ''}`}/>
          <small id="atlas-pin-hint">{m.pinHint}</small>
          <button className="atlas-btn" type="submit" disabled={busy || pin.length < 8}>{state.phase === 'authenticating' ? m.signingIn : m.signIn}</button>
          {noticeText && <p id="atlas-pin-notice" role="alert" className="atlas-warn">{noticeText}</p>}
        </form></div>
      )}
      {live && showAutonomy && <ResearchAutonomyPanel loadStatus={loadAutonomy} locale={locale === 'en' ? 'en' : 'pt'} onBack={() => setShowAutonomy(false)}/>}
      {live && !showAutonomy && (
        <>
          <Suspense fallback={<p className="atlas-private-check" role="status"><span className="atlas-private-loader" aria-hidden="true"/>{locale === 'en' ? 'Loading your workspace…' : 'Carregando seu espaço…'}</p>}>
            <PrivateFrame data={state.data} title={m.frameTitle} locale={locale} onLogout={() => void logout()} onError={onFrameError} onReady={onFrameReady}/>
          </Suspense>
        </>
      )}
    </main>
  );
}

export default function PrivateApp() {
  const m = useMessages();
  // A frame failure remounts the whole area: the controller is rebuilt and the session is
  // revalidated before any frame (or data) comes back. Repeated failures stop and say so.
  const [epoch, setEpoch] = useState(0);
  const [failures, setFailures] = useState(0);
  const onFrameError = () => { setFailures(f => f + 1); setEpoch(e => e + 1); };
  return (
    <Shell area="private">
      {failures >= MAX_FRAME_FAILURES ? (
        <main className="atlas-main private-root">
          <h1>{m.privateTitle}</h1>
          <p role="alert" className="atlas-warn">{m.frameUnavailable}</p>
          <button type="button" className="atlas-btn" onClick={() => { setFailures(0); setEpoch(e => e + 1); }}>{m.frameRetry}</button>
        </main>
      ) : <PrivateArea key={epoch} onFrameError={onFrameError} onFrameReady={() => setFailures(0)}/>}
    </Shell>
  );
}
