import {createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode} from 'react';
import {createLocaleController, type LocaleController} from '../../i18n/locale.ts';
import {MESSAGES, type Messages} from '../../i18n/messages.ts';
import {LOCALES, type Locale} from '../api.ts';

const Ctx = createContext<{state: ReturnType<LocaleController['getSnapshot']>; ctl: LocaleController} | null>(null);

export function LocaleProvider({children}: {children: ReactNode}) {
  const [ctl] = useState(() => createLocaleController({
    fetch: (u, i) => fetch(u, i),
    storage: () => window.localStorage,
    languages: navigator.languages?.length ? navigator.languages : [navigator.language],
    win: window,
  }));
  const state = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot, ctl.getSnapshot);
  useEffect(() => { ctl.start(); return () => ctl.dispose(); }, [ctl]);
  useEffect(() => { document.documentElement.lang = state.locale; }, [state.locale]);
  const value = useMemo(() => ({state, ctl}), [state, ctl]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useCtx() { const v = useContext(Ctx); if (!v) throw new Error('LocaleProvider missing'); return v; }
export const useLocale = (): Locale => useCtx().state.locale;
export const useMessages = (): Messages => MESSAGES[useCtx().state.locale];

const NAMES: Record<Locale, string> = {'pt-BR': 'PT-BR', en: 'EN'};
export function LocaleSwitch() {
  const {state, ctl} = useCtx();
  const m = MESSAGES[state.locale];
  return (
    <div className="atlas-seg" role="group" aria-label={m.langLabel}>
      {LOCALES.map(l => (
        <button key={l} type="button" aria-pressed={state.mode === 'manual' && state.locale === l} onClick={() => ctl.choose(l)}>{NAMES[l]}</button>
      ))}
      <button type="button" aria-pressed={state.mode === 'auto'} onClick={() => { void ctl.setAuto(); }}>{m.langAuto}</button>
    </div>
  );
}
