import {useVisitorMotion} from './useVisitorMotion.ts';
import '../visitor-motion.css';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {LocaleSwitch, useLocale, useMessages} from './LocaleProvider.tsx';
import {PRESENTATION} from '../../i18n/presentation.ts';
import {goToPublicSection} from '../publicNavigation.ts';
import {useTheme, type ThemePref} from './useTheme.ts';
import CosmologicalBackdrop from './CosmologicalBackdrop.tsx';

const SECTIONS = ['works', 'lines', 'methods', 'contact'] as const;
const PRIVATE_COCKPIT_URL = String(import.meta.env.VITE_PRIVATE_COCKPIT_URL || '/#/privado').trim();
export default function Shell({area, children}: {area: 'public' | 'private'; children: ReactNode}) {
  const m = useMessages();
  const locale = useLocale();
  const t = PRESENTATION[locale];
  const {pref, choose} = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [cinemaPaused, setCinemaPaused] = useState(()=>{try{return sessionStorage.getItem('nexo-motion-paused')==='true';}catch{return false;}});
  useEffect(()=>{try{sessionStorage.setItem('nexo-motion-paused',String(cinemaPaused));}catch{}},[cinemaPaused]);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { const mq = window.matchMedia('(prefers-reduced-motion: reduce)'); const sync = () => setReducedMotion(mq.matches); mq.addEventListener('change', sync); return () => mq.removeEventListener('change', sync); }, []);
  const surface=useRef<HTMLDivElement>(null);
  useVisitorMotion(surface,area==='public'&&!cinemaPaused&&!reducedMotion);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const opts: [ThemePref, string][] = [['light', m.themeLight], ['dark', m.themeDark], ['system', m.themeSystem]];
  useEffect(() => { setMenuOpen(false); }, [area]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); } };
    const outside = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) setMenuOpen(false); };
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('keydown', close); window.removeEventListener('pointerdown', outside); };
  }, [menuOpen]);
  useEffect(() => {
    if (area !== 'public') return;
    const media = window.matchMedia('(min-width: 901px)');
    const close = () => { if (media.matches) setMenuOpen(false); };
    media.addEventListener('change', close);
    return () => media.removeEventListener('change', close);
  }, [area]);
  useEffect(() => {
    if (area !== 'public' || !('IntersectionObserver' in window)) return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => visible.set(entry.target.id.slice(2), entry.isIntersecting));
      setActiveSection(SECTIONS.find(id => visible.get(id)) ?? null);
    }, {rootMargin: '-12% 0px -55% 0px'});
    SECTIONS.forEach(id => { const section = document.getElementById(`s-${id}`); if (section) observer.observe(section); });
    return () => observer.disconnect();
  }, [area]);
  return (
    <div ref={surface} className="atlas-app" data-area={area} data-cinema-paused={cinemaPaused || reducedMotion}>
      <a className="nexo-skip-link" href={area==='public'?'#public-content':'#private-content'} onClick={event=>{const el=document.querySelector<HTMLElement>(area==='public'?'#public-content':'main');if(el){event.preventDefault();el.setAttribute('tabindex','-1');el.focus();el.scrollIntoView({block:'start'});}}}>{locale==='en'?'Skip to content':'Ir para o conteúdo'}</a>
      {area==='public'&&<div className="nexo-reading-progress" aria-hidden="true"/>}
      <CosmologicalBackdrop paused={cinemaPaused}/>
      {menuOpen && <button type="button" className="atlas-menu-backdrop" tabIndex={-1} aria-label={t.nav.close} onClick={() => { setMenuOpen(false); menuButton.current?.focus(); }}/>}
      <header className="atlas-header" ref={header} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false); }}>
        <a className="atlas-brand" href="/#/" onClick={() => setMenuOpen(false)}><span className="atlas-mark" aria-hidden="true"/>{m.brand}<small>{m.tagline}</small></a>
        <button ref={menuButton} type="button" className="atlas-menu-toggle" aria-expanded={menuOpen} aria-controls="atlas-header-menu" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? t.nav.close : area === 'private' ? (locale === 'en' ? 'Options' : 'Opções') : t.nav.menu}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d={menuOpen?'M6 6l12 12M6 18 18 6':'M4 8h16M4 16h16'}/></svg></button>
        <div id="atlas-header-menu" className={`atlas-header-menu${menuOpen ? ' is-open' : ''}`}>
          <nav aria-label={m.navLabel} className="atlas-nav">
            {area === 'public' && <ul className="atlas-toc">{SECTIONS.map(id => <li key={id}><button type="button" aria-current={activeSection===id?'location':undefined} onClick={() => { setMenuOpen(false); goToPublicSection(id); }}>{t.nav[id]}</button></li>)}</ul>}
            {area === 'public' ? <a href={PRIVATE_COCKPIT_URL} onClick={() => setMenuOpen(false)}>{m.privateLink}</a> : <a href="/#/">{m.backPublic}</a>}
          </nav>
          <div className="atlas-controls">
            <LocaleSwitch/>
            <button type="button" className="atlas-cinema-toggle" aria-pressed={cinemaPaused || reducedMotion} disabled={reducedMotion} onClick={() => setCinemaPaused(value => !value)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">{cinemaPaused || reducedMotion ? <path d="M4 2 13 8 4 14Z"/> : <path d="M3 2h3v12H3zM10 2h3v12h-3z"/>}</svg>
              {reducedMotion ? (locale === 'en' ? 'Reduced motion' : 'Movimento reduzido') : cinemaPaused ? (locale === 'en' ? 'Play animation' : 'Reproduzir animação') : (locale === 'en' ? 'Pause animation' : 'Pausar animação')}
            </button>
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
