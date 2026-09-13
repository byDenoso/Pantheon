import {useEffect,useState} from 'react';

type Theme='system'|'light'|'dark'|'deep-space'|'high-contrast';
type ResolvedTheme='light'|'dark'|'deep-space'|'high-contrast';
const STORAGE_KEY='nexo-atlas-theme';
const THEMES:Theme[]=['system','light','dark','deep-space','high-contrast'];
const labels:Record<Theme,string>={system:'Sistema',light:'Claro',dark:'Escuro','deep-space':'Deep Space','high-contrast':'Alto contraste'};
const savedTheme=():Theme=>{try{const saved=localStorage.getItem(STORAGE_KEY) as Theme|null;return saved&&THEMES.includes(saved)?saved:'system'}catch{return'system'}};
const resolveTheme=(theme:Theme,dark:boolean):ResolvedTheme=>theme==='system'?(dark?'dark':'light'):theme;

export function ThemeToggle(){
  const [theme,setTheme]=useState<Theme>(()=>savedTheme());
  const [systemDark,setSystemDark]=useState(()=>typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches);
  const resolved=resolveTheme(theme,systemDark);
  useEffect(()=>{
    if(typeof matchMedia!=='function')return;
    const media=matchMedia('(prefers-color-scheme: dark)');const sync=()=>setSystemDark(media.matches);sync();media.addEventListener?.('change',sync);return()=>media.removeEventListener?.('change',sync);
  },[]);
  useEffect(()=>{
    document.documentElement.dataset.theme=resolved;
    document.documentElement.dataset.themeMode=theme;
    document.documentElement.style.colorScheme=resolved==='light'?'light':'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',resolved==='light'?'#edf2f7':resolved==='deep-space'?'#000205':'#071018');
    try{localStorage.setItem(STORAGE_KEY,theme)}catch{}
    window.dispatchEvent(new CustomEvent('atlas:theme-change',{detail:{theme,resolved}}));
  },[resolved,theme]);
  return <label className="theme-switcher" title="Tema da interface"><span className="sr-only">Tema</span><select aria-label="Tema da interface" value={theme} onChange={event=>setTheme(event.target.value as Theme)}>{THEMES.map(value=><option key={value} value={value}>{labels[value]}</option>)}</select></label>;
}
