import type { ReactNode } from 'react';
import type { AtlasSession } from '../core/auth';
import { readStoredGoogleSession } from '../core/google-session';

export function PrivateGate({ session, area, onGoToLogin, children }: {
  session: AtlasSession | null;
  area: string;
  onGoToLogin: () => void;
  children: ReactNode;
}) {
  const effective=session || readStoredGoogleSession();
  if(effective) return <>{children}</>;
  return <div className="page-wrap"><section className="panel-empty"><span className="eyebrow">ÁREA OPERACIONAL</span><h2>{area}</h2><p>Entre para acessar readers privados e comandos de escrita governados pelo NEXO.</p><button type="button" onClick={onGoToLogin}>Entrar no Atlas</button></section></div>;
}
