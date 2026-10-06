// A separate local artifact using synthetic data. Never run as part of the production build.
import {build} from 'vite';
import {writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {privateWorkspaceState} from '../test/helpers/private-workspace.fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const destination=resolve(process.argv[2]??'../private-workspace-preview.html');
const entry=resolve(root,`test/.private-workspace-preview-${process.pid}.tsx`);
const state=privateWorkspaceState();
const code=`import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import PrivateWorkspace from '../src/private-workspace/PrivateWorkspace.tsx';
import {workspaceRoute} from '../src/private-workspace/model.ts';
import '@fontsource/ibm-plex-sans/400';
import '@fontsource/ibm-plex-sans/500';
import '@fontsource/ibm-plex-sans/600';
import '@fontsource/ibm-plex-mono/400';
const state=${JSON.stringify(state)};
function Preview(){const [route,setRoute]=useState(()=>workspaceRoute(location.hash));useEffect(()=>{const update=()=>setRoute(workspaceRoute(location.hash));window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);return route?<PrivateWorkspace state={state as any} generatedAt={state.generated_at} route={route}/>:<main style={{padding:80,color:'#fff',fontFamily:'system-ui'}}><h1>Esta visão anterior não está incluída na prévia local.</h1><a href="#/teia">Voltar à teia</a></main>;}
createRoot(document.getElementById('root')!).render(<Preview/>);`;
writeFileSync(entry,code);
try{
 const built=await build({configFile:false,root,base:'./',build:{write:false,sourcemap:false,minify:true,lib:{entry,name:'NexoPrivatePreview',formats:['iife']}}});
 const output=(Array.isArray(built)?built:[built]).flatMap(result=>result.output);
 const js=output.filter(item=>item.type==='chunk').map(item=>item.code).join('\n');
 const css=output.filter(item=>item.type==='asset'&&item.fileName.endsWith('.css')).map(item=>String(item.source)).join('\n');
 const setup=`const preferences=new Map([['atlas.theme','dark']]);Object.defineProperty(window,'localStorage',{value:{getItem:key=>preferences.get(key)||null,setItem:(key,value)=>preferences.set(key,String(value)),removeItem:key=>preferences.delete(key),clear:()=>preferences.clear()},configurable:true});window.fetch=async()=>{throw new Error('OFFLINE_SYNTHETIC_PREVIEW');};window.previewLanguage=lang=>document.documentElement.lang=lang;window.previewTheme=theme=>{preferences.set('atlas.theme',theme);dispatchEvent(new StorageEvent('storage',{key:'atlas.theme',newValue:theme}));};`;
 const controls=`<aside class="preview-bar"><span>Prévia sintética da área privada · Sem conexão a dados reais</span><div><button onclick="previewLanguage('pt-BR')">PT-BR</button><button onclick="previewLanguage('en')">EN</button><button onclick="previewTheme('light')">Claro</button><button onclick="previewTheme('dark')">Escuro</button></div></aside>`;
 const style=`html,body{margin:0;background:#000}.pw{top:44px}.preview-bar{position:fixed;z-index:100;inset:0 0 auto;min-height:44px;padding:6px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#111d36;color:#ccd9f3;font:12px/1.4 system-ui}.preview-bar div{display:flex;gap:4px}.preview-bar button{border:1px solid #466093;border-radius:4px;background:transparent;color:#fff;padding:5px 9px;font:12px system-ui;min-height:30px;cursor:pointer}@media(max-width:700px){.preview-bar{height:82px;flex-wrap:wrap}.pw{top:82px}}`;
 const html=`<!doctype html><html lang="pt-BR" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>NEXO · Prévia privada sintética</title><style>${css}</style><style>${style}</style></head><body>${controls}<div id="root"></div><script>${setup.replace(/<\/script/gi,'<\\/script')}<\/script><script>${js.replace(/<\/script/gi,'<\\/script')}<\/script></body></html>`;
 mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,html);
 console.log(JSON.stringify({path:destination,bytes:Buffer.byteLength(html),source:'synthetic-only',tests:state.science_projection_v1.tests.length,outputFiles:output.map(item=>item.fileName)}));
}finally{rmSync(entry,{force:true});}
