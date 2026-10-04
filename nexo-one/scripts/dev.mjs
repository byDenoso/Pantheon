import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import path from 'node:path';
import handler from '../server/handler.mjs';
const built=process.argv.includes('--built');
const vite=built?null:await(await import('vite')).createServer({
  // Worktrees and fixture servers may share dependencies, but not optimized module identities.
  cacheDir:path.resolve('.tmp', `vite-${process.env.PORT||4173}`),
  resolve:{dedupe:['three']},
  server:{middlewareMode:true,fs:{allow:[path.resolve('.'),realpathSync(path.resolve('node_modules'))]},hmr:{port:24678+Number(process.env.PORT||4173)-4173},watch:{ignored:['**/output/**']}},
  optimizeDeps:{entries:['index.html','atlas3d/index.html','mcp/index.html']},
  appType:'spa',
});
const root=path.resolve('dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const host=process.env.HOST||'127.0.0.1';
const port=Number(process.env.PORT||4173);
http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/'))return handler(req,res);
  if(vite)return vite.middlewares(req,res);
  try{const url=new URL(req.url,'http://local');const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}
}).listen(port,host,()=>console.log(`NEXO ONE http://${host}:${port}`));
