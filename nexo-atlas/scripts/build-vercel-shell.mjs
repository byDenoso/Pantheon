import {build} from 'vite';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const replace=(text,from,to)=>{if(!text.includes(from))throw Error('VERCEL_SHELL_ADAPTATION_MISSING');return text.replaceAll(from,to);};
await build({configFile:resolve(root,'vite.config.ts'),root,base:'/atlas-v67/',publicDir:false,plugins:[{
  name:'vercel-owner-login',enforce:'pre',
  transform(code,id){
    if(!id.endsWith('/src/atlas/ui/IdentityGate.tsx'))return null;
    code=replace(code,"'/signin-with-chatgpt?return_to=' + encodeURIComponent('/#/privado')","'/api/auth/google'");
    code=replace(code,'Sign in with your ChatGPT account','Sign in with your Google account');
    code=replace(code,'Entre com sua conta do ChatGPT','Entre com sua conta Google');
    code=replace(code,'Sign in with ChatGPT','Sign in with Google');
    code=replace(code,'Entrar com ChatGPT','Entrar com Google');
    return code;
  },
  transformIndexHtml(html){return html.replace('<link rel="stylesheet" href="/assets/nexo-extra.css">','').replace('<script src="/assets/nexo-footer.js" defer></script>','');}
}],build:{outDir:resolve(root,'../nexo-one/dist/atlas-v67'),emptyOutDir:true,target:'es2022',sourcemap:false},logLevel:'warn'});
