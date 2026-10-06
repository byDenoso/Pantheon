import {useEffect, useRef, useState, type ReactNode} from 'react';
import {LocaleSwitch, useLocale, useMessages} from './LocaleProvider.tsx';
import {PRESENTATION} from '../../i18n/presentation.ts';
import {goToPublicSection} from '../publicNavigation.ts';
import {useTheme, type ThemePref} from './useTheme.ts';

const SECTIONS = ['lines', 'methods', 'works', 'contact'] as const;
export default function Shell({area, children}: {area: 'public' | 'private'; children: ReactNode}) {
  const m = useMessages();
  const t = PRESENTATION[useLocale()];
  const {pref, choose} = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const opts: [ThemePref, string][] = [['light', m.themeLight], ['dark', m.themeDark], ['system', m.themeSystem]];
  useEffect(() => { setMenuOpen(false); }, [area]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menuOpen]);
  return (
    <div className="atlas-app" data-area={area}>
      <header className="atlas-header">
        <a className="atlas-brand" href="#/" onClick={() => setMenuOpen(false)}><span className="atlas-mark" aria-hidden="true"/>{m.brand}<small>{m.tagline}</small></a>
        {area === 'public' && <button ref={menuButton} type="button" className="atlas-menu-toggle" aria-expanded={menuOpen} aria-controls="atlas-header-menu" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? t.nav.close : t.nav.menu}</button>}
        <div id="atlas-header-menu" className={`atlas-header-menu${menuOpen ? ' is-open' : ''}`}>
          <nav aria-label={m.navLabel} className="atlas-nav">
            {area === 'public' && <ul className="atlas-toc">{SECTIONS.map(id => <li key={id}><button type="button" onClick={() => { setMenuOpen(false); goToPublicSection(id); }}>{t.nav[id]}</button></li>)}</ul>}
            {area === 'public' ? <a href="#/privado" onClick={() => setMenuOpen(false)}>{m.privateLink}</a> : <a href="#/">{m.backPublic}</a>}
          </nav>
          <div className="atlas-controls">
            <LocaleSwitch/>
            <div className="atlas-seg" role="group" aria-label={m.themeLabel}>
              {opts.map(([k, label]) => <button key={k} type="button" aria-pressed={pref === k} onClick={() => choose(k)}>{label}</button>)}
            </div>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
