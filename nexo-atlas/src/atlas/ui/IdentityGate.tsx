import {useEffect, useState, type FormEvent, type ReactNode} from 'react';
import {useLocale} from './LocaleProvider.tsx';
import Shell from './Shell.tsx';

type Access = {signedIn: boolean; owner: boolean; setupRequired: boolean};
export default function IdentityGate({children}: {children: ReactNode}) {
  const en = useLocale() === 'en';
  const [state, setState] = useState<Access | null>(null), [error, setError] = useState(false), [epoch, setEpoch] = useState(0);
  const [pin, setPin] = useState(''), [repeat, setRepeat] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {const abort = new AbortController(); setState(null); setError(false); fetch('/api/atlas-access', {cache: 'no-store', credentials: 'same-origin', signal: abort.signal}).then(async r => {if (!r.ok) throw Error(); const d = await r.json(); if (typeof d.signedIn !== 'boolean' || typeof d.owner !== 'boolean' || typeof d.setupRequired !== 'boolean') throw Error(); if (!abort.signal.aborted) setState(d);}).catch(() => {if (!abort.signal.aborted) setError(true);}); return () => abort.abort();}, [epoch]);
  if (state?.owner && !state.setupRequired) return children;
  const signIn = '/signin-with-chatgpt?return_to=' + encodeURIComponent('/#/privado');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || pin !== repeat || pin.length < 8) return;
    const value = pin; setPin(''); setRepeat(''); setBusy(true); setError(false);
    try {const response = await fetch('/api/atlas-pin/setup', {method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({pin: value})}); if (!response.ok) throw Error(); setEpoch(n => n + 1);} catch {setError(true);} finally {setBusy(false);}
  };
  return <Shell area="private"><main className="atlas-main private-root"><h1>{en ? 'Private Atlas' : 'Atlas privado'}</h1>
    {!state && !error && <p role="status">{en ? 'Checking your account…' : 'Verificando sua conta…'}</p>}
    {error && <p role="alert">{en ? 'Access could not be confirmed. Try again.' : 'Não foi possível confirmar o acesso. Tente novamente.'} <button className="atlas-btn" onClick={() => setEpoch(n => n + 1)}>{en ? 'Retry' : 'Tentar novamente'}</button></p>}
    {state && !state.signedIn && <><p>{en ? 'Sign in with your ChatGPT account, then enter your access code.' : 'Entre com sua conta do ChatGPT e, depois, informe seu código de acesso.'}</p><p>{en ? 'Google Drive consent covers read-only access to the connection. This Atlas uses only the owner’s Tower file; it does not allow other visitors to read it.' : 'A autorização do Google Drive permite leitura da conexão. Este Atlas usa apenas o arquivo Tower do proprietário e não permite que outros visitantes o leiam.'}</p><a className="atlas-btn" href={signIn} target="_top">{en ? 'Sign in with ChatGPT' : 'Entrar com ChatGPT'}</a></>}
    {state?.signedIn && !state.owner && <><p>{en ? 'This private area belongs to another account.' : 'Esta área privada pertence a outra conta.'}</p><a className="atlas-btn" href={'/signout-with-chatgpt?return_to=' + encodeURIComponent('/#/privado')} target="_top">{en ? 'Switch account' : 'Trocar de conta'}</a></>}
    {state?.owner && state.setupRequired && <form className="atlas-form" onSubmit={submit} autoComplete="off"><p>{en ? 'Create your second access code here. Only its protected hash is stored.' : 'Crie aqui seu segundo código de acesso. Apenas o hash protegido será armazenado.'}</p><label htmlFor="new-pin">{en ? 'Access code' : 'Código de acesso'}</label><input id="new-pin" type="password" minLength={8} maxLength={128} autoComplete="new-password" value={pin} onChange={e => setPin(e.target.value)} required disabled={busy}/><label htmlFor="repeat-pin">{en ? 'Repeat access code' : 'Repita o código'}</label><input id="repeat-pin" type="password" minLength={8} maxLength={128} autoComplete="new-password" value={repeat} onChange={e => setRepeat(e.target.value)} required disabled={busy}/><button type="submit" className="atlas-btn" disabled={busy || pin.length < 8 || pin !== repeat}>{busy ? (en ? 'Saving…' : 'Salvando…') : (en ? 'Save and continue' : 'Salvar e continuar')}</button></form>}
  </main></Shell>;
}
