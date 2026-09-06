const KEY='atlas.theme';
export function initialTheme(){try{const saved=localStorage.getItem(KEY);if(['dark','light'].includes(saved))return saved}catch{}return 'dark'}
export function installTheme(button,onChange){
 function apply(theme){document.documentElement.dataset.theme=theme;button.setAttribute('aria-pressed',String(theme==='light'));button.textContent=theme==='light'?'☾ Escuro':'☀ Claro';button.setAttribute('aria-label',theme==='light'?'Ativar tema escuro':'Ativar tema claro');document.querySelector('meta[name="theme-color"]').content=theme==='light'?'#f8fcff':'#050816';try{localStorage.setItem(KEY,theme)}catch{}onChange(theme)}
 apply(initialTheme());button.onclick=()=>apply(document.documentElement.dataset.theme==='light'?'dark':'light');
}
