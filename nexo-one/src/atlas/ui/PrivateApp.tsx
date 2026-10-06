import {lazy, Suspense, useState, type FormEvent} from 'react';
import {useLocale, useMessages} from './LocaleProvider.tsx';
import {usePrivateSession} from './usePrivateSession.ts';
import Shell from './Shell.tsx';

// The existing Atlas screens run inside a guarded same-origin frame (see PrivateFrame).
const PrivateFrame = lazy(() => import('./PrivateFrame.tsx'));
const MAX_FRAME_FAILURES = 2;

function PrivateArea({onFrameError, onFrameReady}: {onFrameError: (code: string) => void; onFrameReady: () => void}) {
  const m = useMessages(); const locale = useLocale();
  const {state, login, logout, retryRevocation} = usePrivateSession();
  const [pin, setPin] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = pin;
    setPin(''); // never keep the code in component state after submit
    void login(v);
  };
  const busy = state.phase === 'authenticating' || state.revocation === 'pending';
  const noticeText = state.notice === 'rate_limited' && state.retryAfter ? m.rateLimited(state.retryAfter) : state.notice ? m.notices[state.notice] : null;
  const revText = state.revocation === 'pending' ? m.revPending : state.revocation === 'revoked' ? m.revRevoked : state.revocation === 'unconfirmed' ? m.revUnconfirmed : null;
  const live = state.phase === 'authenticated' && state.data !== null;

  return (
    <main className={`atlas-main private-root${live ? ' has-frame' : ''}`}>
      <div className="atlas-row">
        <h1>{m.privateTitle}</h1>
        {live && <button type="button" className="atlas-btn" onClick={() => void logout()}>{m.signOut}</button>}
      </div>
      {state.phase === 'checking' && <p role="status">{m.checking}</p>}
      {revText && <p role="status" className={state.revocation === 'unconfirmed' ? 'atlas-warn' : undefined}>{revText}{' '}
        {state.revocation === 'unconfirmed' && <button type="button" className="atlas-btn" onClick={() => void retryRevocation()}>{m.revRetry}</button>}</p>}
      {state.phase !== 'authenticated' && state.phase !== 'checking' && (
        <form onSubmit={submit} className="atlas-form" autoComplete="off">
          <p>{m.privateLead}</p>
          <label htmlFor="atlas-pin">{m.pinLabel}</label>
          <input id="atlas-pin" type="password" value={pin} onChange={e => setPin(e.target.value)} minLength={8} maxLength={128} autoComplete="off" required disabled={busy} aria-describedby="atlas-pin-hint"/>
          <small id="atlas-pin-hint">{m.pinHint}</small>
          <button className="atlas-btn" type="submit" disabled={busy || pin.length < 8}>{state.phase === 'authenticating' ? m.signingIn : m.signIn}</button>
          {noticeText && <p role="alert" className="atlas-warn">{noticeText}</p>}
        </form>
      )}
      {live && state.data && (
        <>
          {state.expiresAt && <p><small>{m.expires} {new Date(state.expiresAt).toLocaleString()}</small></p>}
          <Suspense fallback={<p role="status">{m.checking}</p>}>
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
