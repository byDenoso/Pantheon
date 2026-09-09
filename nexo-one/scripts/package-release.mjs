import {mkdir,readFile,readdir,writeFile,rm,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const target='release';await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
async function copyTree(source,dest,filter=()=>true){for(const e of await readdir(source,{withFileTypes:true})){const s=path.join(source,e.name),d=path.join(dest,e.name);if(e.isDirectory()){await mkdir(d,{recursive:true});await copyTree(s,d,filter);}else if(filter(s)){await mkdir(path.dirname(d),{recursive:true});await copyFile(s,d);}}}
await copyTree('dist',target);await copyTree('server',`${target}/server`);await copyTree('src/contracts',`${target}/src/contracts`,p=>p.endsWith('.mjs'));await copyTree('api',`${target}/api`);
await writeFile(`${target}/package.json`,JSON.stringify({name:'nexo-one',version:'0.1.0',type:'module',engines:{node:'24.x'}}));
const config=JSON.parse(await readFile('vercel.json','utf8'));
await writeFile(`${target}/vercel.json`,JSON.stringify({version:2,builds:[{src:'api/index.js',use:'@vercel/node'},{src:'index.html',use:'@vercel/static'},{src:'assets/**',use:'@vercel/static'}],routes:[{src:'/(.*)',headers:Object.fromEntries(config.headers[0].headers.map(v=>[v.key,v.value])),continue:true},{src:'/api/(.*)',dest:'/api/index.js?route=$1'},{handle:'filesystem'},{src:'/(.*)',dest:'/index.html'}]},null,2));
const files=[];async function collect(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await collect(p);else {const data=await readFile(p);files.push({path:path.relative(target,p),sha256:createHash('sha256').update(data).digest('hex')});}}}await collect(target);files.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile(`${target}/release-manifest.json`,JSON.stringify({contractVersion:'1',gitCommit:process.env.GITHUB_SHA||null,files},null,2));console.log(`Packaged ${files.length} files; no fixture data or credentials included.`);
