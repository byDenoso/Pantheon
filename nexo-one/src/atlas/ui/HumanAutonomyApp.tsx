import {useState, type FormEvent} from 'react';
import {useHumanSession} from '../useHumanSession.ts';
import {LocaleSwitch, useLocale, useMessages} from './LocaleProvider.tsx';
import {useTheme} from './useTheme.ts';
import AutonomyControlPanel from './AutonomyControlPanel.tsx';

/** Reuses the existing session client; only the native server session unlocks this page. */
export default function HumanAutonomyApp() {
  const locale = useLocale(), en = locale === 'en', m = useMessages();
  const access = useHumanSession(), {pref, choose} = useTheme();
  const [pin, setPin] = useState(''), [signedOut, setSignedOut] = useState(false);
  const live = access.runtime === 'VERCEL_NATIVE' && access.session.authenticated && !signedOut;
  const ready = access.runtime === 'VERCEL_NATIVE' && access.session.configured;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); const value = pin; setPin('');
    if (ready && await access.login(value)) setSignedOut(false);
  };
  return <div className="atlas-app" data-area="private">
    <header className="atlas-header"><a className="atlas-brand" href="/">NEXO<small>{en ? 'Private autonomy' : 'Autonomia privada'}</small></a>
      <div className="atlas-controls"><LocaleSwitch/>
        <div className="atlas-seg" role="group" aria-label={m.themeLabel}>
          {(['light', 'dark', 'system'] as const).map(theme => <button key={theme} type="button" aria-pressed={pref === theme}
            onClick={() => choose(theme)}>{theme === 'light' ? m.themeLight : theme === 'dark' ? m.themeDark : m.themeSystem}</button>)}
        </div>
      </div>
    </header>
    <main className="atlas-main private-root">
      <div className="atlas-row"><h1>{en ? 'Research autonomy' : 'Autonomia da pesquisa'}</h1>
        {live && <button type="button" className="atlas-btn" disabled={access.pending} onClick={() => {setSignedOut(true); setPin(''); void access.logout();}}>{m.signOut}</button>}
      </div>
      {access.runtimeAvailable === null && <p role="status">{m.checking}</p>}
      {live ? <>
        <p className="atlas-note">{en ? 'Private session confirmed by the native server.' : 'Sessão privada confirmada pelo servidor nativo.'}</p>
        <AutonomyControlPanel locale={locale}/>
      </> : ready ? <form className="atlas-form" onSubmit={event => void submit(event)} autoComplete="off">
        <p>{en ? 'Use the existing private access code to review the mandate.' : 'Use o código de acesso privado existente para revisar o mandato.'}</p>
        <label htmlFor="autonomy-access-code">{m.pinLabel}</label>
        <input id="autonomy-access-code" type="password" value={pin} onChange={e => setPin(e.target.value)} minLength={8} maxLength={128}
          autoComplete="off" required disabled={access.pending} aria-describedby="autonomy-access-hint"/>
        <small id="autonomy-access-hint">{m.pinHint}</small>
        <button type="submit" className="atlas-btn" disabled={access.pending || pin.length < 8}>{access.pending ? m.signingIn : m.signIn}</button>
      </form> : access.runtimeAvailable !== null && <p role="alert" className="atlas-warn">
        {en ? 'The existing native private session is unavailable on this host.' : 'A sessão privada nativa existente está indisponível neste host.'}
      </p>}
      {access.error && <p role="alert" className="atlas-warn">{access.error === 'AUTH_REQUIRED'
        ? en ? 'The access code was refused.' : 'O código de acesso foi recusado.'
        : access.error === 'RATE_LIMITED' ? en ? 'Too many attempts. Wait before trying again.' : 'Muitas tentativas. Aguarde antes de tentar novamente.'
          : en ? 'The native session could not be confirmed.' : 'Não foi possível confirmar a sessão nativa.'}</p>}
      <p><a href="/">{m.backPublic}</a></p>
    </main>
  </div>;
}
