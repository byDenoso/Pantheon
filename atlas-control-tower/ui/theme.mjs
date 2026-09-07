const KEY='atlas.theme';

// Load the typography/contrast pass from the same origin as this module.
if(typeof document!=='undefined'&&!document.querySelector('link[data-atlas-readability]')){
 const link=document.createElement('link');link.rel='stylesheet';link.dataset.atlasReadability='1';link.href=new URL('./readability.css',import.meta.url).href;document.head.append(link);
}

// Canvas text needs its own typography pass because CSS cannot style the labels.
if(typeof CanvasRenderingContext2D!=='undefined'&&!CanvasRenderingContext2D.prototype.__atlasCleanLabels){
 const proto=CanvasRenderingContext2D.prototype,raw=proto.fillText;
 proto.fillText=function(text,...args){
  if(typeof text==='string')text=text.replace(/\s*·\s*CLIQUE PARA ABRIR/gi,'');
  const oldFont=this.font,oldShadow=this.shadowColor,oldBlur=this.shadowBlur,oldOY=this.shadowOffsetY;
  const m=String(oldFont).match(/(\d+(?:\.\d+)?)px/);if(m){const n=Number(m[1]),bumped=n<=9?n+1.5:n<=13?n+2:n+2.5;this.font=String(oldFont).replace(/\d+(?:\.\d+)?px/,`${bumped}px`).replace(/^600\s/,'700 ')}
  const dark=typeof document==='undefined'||document.documentElement.dataset.theme!=='light';this.shadowColor=dark?'rgba(0,0,0,.9)':'rgba(255,255,255,.98)';this.shadowBlur=3;this.shadowOffsetY=1;
  const out=raw.call(this,text,...args);this.font=oldFont;this.shadowColor=oldShadow;this.shadowBlur=oldBlur;this.shadowOffsetY=oldOY;return out;
 };
 Object.defineProperty(proto,'__atlasCleanLabels',{value:true});
}

export function initialTheme(){try{const saved=localStorage.getItem(KEY);if(['dark','light'].includes(saved))return saved}catch{}return'dark'}
export function installTheme(button,onChange){
 function apply(theme){document.documentElement.dataset.theme=theme;button.setAttribute('aria-pressed',String(theme==='light'));button.textContent=theme==='light'?'☾ Escuro':'☀ Claro';button.setAttribute('aria-label',theme==='light'?'Ativar tema escuro':'Ativar tema claro');document.querySelector('meta[name="theme-color"]').content=theme==='light'?'#f8fcff':'#050816';try{localStorage.setItem(KEY,theme)}catch{}onChange(theme)}
 apply(initialTheme());button.onclick=()=>apply(document.documentElement.dataset.theme==='light'?'dark':'light');
}
