import {useEffect, useRef, useState, type ReactNode} from 'react';
import {useLocale} from './LocaleProvider.tsx';
import '../cinema/cinema.css';
import '../cinema/cosmological-backdrop.css';

// Generated decorative illustrations; neither image represents observed data.
const ART = {
  light: new URL('../assets/cmb-light-v1.webp', import.meta.url).href,
  dark: new URL('../assets/expansion-dark-v1.webp', import.meta.url).href,
};
type Theme = keyof typeof ART;
function currentTheme(): Theme {
  const theme = document.documentElement.dataset.theme;
  return theme === 'light' || theme === 'dark' ? theme : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function useArtwork() {
  const [theme, setTheme] = useState(currentTheme);
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const sync = () => { setTheme(currentTheme()); setHidden(document.hidden); };
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {attributes:true,attributeFilter:['data-theme']});
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => { observer.disconnect(); media.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync); };
  }, []);
  return {theme, hidden, src:ART[theme]};
}
export default function CosmologicalBackdrop({paused}: {paused: boolean}) {
  const {theme, hidden, src} = useArtwork();
  return <div className="nexo-cinema-backdrop nexo-cosmic-backdrop" aria-hidden="true" data-illustration={theme === 'light' ? 'cmb' : 'cosmic-expansion'} data-paused={paused || hidden}>
    <img className="nexo-cosmic-image" src={src} width="1536" height="1024" alt="" decoding="async"/>
  </div>;
}

export function CosmologicalHero({fallback}: {fallback:ReactNode}) {
  const {theme, hidden, src} = useArtwork();
  const locale = useLocale();
  const [failed, setFailed] = useState<string | null>(null);
  const figure=useRef<HTMLElement>(null),[visible,setVisible]=useState(true);
  useEffect(()=>{const node=figure.current;if(!node||!('IntersectionObserver' in window))return;const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{rootMargin:'100px'});observer.observe(node);return()=>observer.disconnect();},[src,failed]);
  if (failed === src) return fallback;
  const caption = theme === 'light'
    ? locale === 'en' ? 'Illustration of the cosmic microwave background' : 'Ilustração da radiação cósmica de fundo'
    : locale === 'en' ? 'Illustration of cosmic expansion' : 'Ilustração da expansão cósmica';
  return <figure ref={figure} className="atlas-hero-art nexo-themed-art" data-illustration={theme === 'light' ? 'cmb' : 'cosmic-expansion'} data-paused={hidden||!visible}>
    <div className="atlas-hero-picture nexo-themed-picture">
      <div className={'nexo-art-scene' + (theme === 'light' ? ' is-cmb' : '')}>
        <img className="nexo-themed-image" src={src} width="1536" height="1024" alt="" fetchPriority="high" decoding="async" onError={() => setFailed(src)}/>
      </div>
    </div>
    <figcaption className="atlas-note">{caption}</figcaption>
  </figure>;
}
