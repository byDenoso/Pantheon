import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import handler from '../server/handler.mjs';
const built=process.argv.includes('--built');
const vite=built?null:await(await import('vite')).createServer({server:{middlewareMode:true},appType:'spa'});
const root=path.resolve('dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/'))return handler(req,res);
  if(vite)return vite.middlewares(req,res);
  try{const url=new URL(req.url,'http://local');const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('NEXO ONE http://127.0.0.1:'+(process.env.PORT||4173)));
