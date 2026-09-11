import { useEffect, useState } from 'react';

type Theme='light'|'dark';
const STORAGE_KEY='nexo-atlas-theme';
const preferredTheme=():Theme=>{
  const saved=localStorage.getItem(STORAGE_KEY);
  if(saved==='light'||saved==='dark')return saved;
  return matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light';
};

export function ThemeToggle(){
  const [theme,setTheme]=useState<Theme>(()=>preferredTheme());
  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    document.documentElement.style.colorScheme=theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#0d100e':'#f4f2ec');
    localStorage.setItem(STORAGE_KEY,theme);
  },[theme]);
  return <button className="theme-toggle" type="button" aria-label={`Usar tema ${theme==='dark'?'claro':'escuro'}`} title={`Tema ${theme==='dark'?'claro':'escuro'}`} onClick={()=>setTheme(value=>value==='dark'?'light':'dark')}>
    <span aria-hidden="true">{theme==='dark'?'☼':'◐'}</span>
  </button>;
}
