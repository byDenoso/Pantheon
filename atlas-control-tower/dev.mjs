import http from 'node:http';import fs from 'node:fs';import handler from './api/atlas.js';
import {frontendFiles} from './frontend-files.mjs';
const allowed={'/':'index.html',...Object.fromEntries(frontendFiles.map(f=>['/'+f,f]))};
http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/'))return handler(req,res);const p=allowed[url.pathname];if(!p||!fs.existsSync(p)){res.writeHead(404);return res.end('Not found')}res.setHeader('Content-Type',p.endsWith('.css')?'text/css':p.endsWith('.mjs')?'text/javascript':'text/html');res.end(fs.readFileSync(p))}).listen(3000,'0.0.0.0',()=>console.log('Atlas :3000'));
