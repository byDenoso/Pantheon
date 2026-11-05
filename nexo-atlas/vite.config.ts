import {defineConfig} from 'vite';
// When the public site follows the owner's live selection (cockpit), its origin must be in
// connect-src. Nothing changes when VITE_PUBLIC_SELECTION_URL is not set.
const selectionOrigin=(()=>{const raw=String(process.env.VITE_PUBLIC_SELECTION_URL||'').trim();if(!raw)return '';const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password)throw new Error('VITE_PUBLIC_SELECTION_URL must be a credential-free https URL');return url.origin;})();
const selectionCsp={name:'atlas-selection-csp',transformIndexHtml(html:string){if(!selectionOrigin)return html;if(!html.includes("connect-src 'self';"))throw new Error('ATLAS_CSP_CONNECT_SRC_NOT_FOUND');return html.replace("connect-src 'self';",`connect-src 'self' ${selectionOrigin};`);}};
const snapshotPreload={name:'atlas-snapshot-preload',transformIndexHtml(html:string){if(process.env.VITE_PUBLIC_API_URL!=='/atlas-public.json')return html;if(!html.includes('<head>'))throw new Error('ATLAS_INDEX_HEAD_NOT_FOUND');return html.replace('<head>','<head><link rel="preload" href="/atlas-public.json" as="fetch" crossorigin="anonymous">');}};
export default defineConfig({plugins:[selectionCsp,snapshotPreload],publicDir:'public-extra',envDir:false as unknown as string,build:{target:'es2022',sourcemap:false,outDir:'dist/client'},server:{host:'127.0.0.1'}});
