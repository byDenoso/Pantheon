const KEY='atlas.theme';

// Graph labels are intentionally terse. Navigation affordance comes from motion,
// cursor/hover and the inspector; repeating "clique para abrir" on every planet
// adds visual noise and reduces legibility in both themes.
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.__atlasCleanLabels) {
 const proto=CanvasRenderingContext2D.prototype,raw=proto.fillText;
 proto.fillText=function(text,...args){
  if(typeof text==='string') text=text.replace(/\s*·\s*CLIQUE PARA ABRIR/gi,'');
  return raw.call(this,text,...args);
 };
 Object.defineProperty(proto,'__atlasCleanLabels',{value:true});
}

export function initialTheme(){try{const saved=localStorage.getItem(KEY);if(['dark','light'].includes(saved))return saved}catch{}return 'dark'}
export function installTheme(button,onChange){
 function apply(theme){document.documentElement.dataset.theme=theme;button.setAttribute('aria-pressed',String(theme==='light'));button.textContent=theme==='light'?'☾ Escuro':'☀ Claro';button.setAttribute('aria-label',theme==='light'?'Ativar tema escuro':'Ativar tema claro');document.querySelector('meta[name="theme-color"]').content=theme==='light'?'#f8fcff':'#050816';try{localStorage.setItem(KEY,theme)}catch{}onChange(theme)}
 apply(initialTheme());button.onclick=()=>apply(document.documentElement.dataset.theme==='light'?'dark':'light');
}
