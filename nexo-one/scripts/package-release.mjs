import {mkdir,readFile,readdir,writeFile,rm,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {buildReleaseVercelConfig} from './release-config.mjs';
const target='release';await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
async function copyTree(source,dest,filter=()=>true){for(const e of await readdir(source,{withFileTypes:true})){const s=path.join(source,e.name),d=path.join(dest,e.name);if(e.isDirectory()){await mkdir(d,{recursive:true});await copyTree(s,d,filter);}else if(filter(s)){await mkdir(path.dirname(d),{recursive:true});await copyFile(s,d);}}}
async function listTree(source,root=source){const out=[];for(const e of await readdir(source,{withFileTypes:true})){const p=path.join(source,e.name);if(e.isDirectory())out.push(...await listTree(p,root));else out.push(path.relative(root,p).split(path.sep).join('/'));}return out;}
await copyTree('dist',target);await copyTree('server',`${target}/server`);await copyTree('src/contracts',`${target}/src/contracts`,p=>p.endsWith('.mjs'));await copyTree('api',`${target}/api`);
await writeFile(`${target}/package.json`,JSON.stringify({name:'nexo-one',version:'0.1.0',type:'module',engines:{node:'24.x'}}));
const provenance={contractVersion:'1',gitCommit:process.env.GITHUB_SHA||null,workflowRun:process.env.GITHUB_RUN_ID||null,workflowAttempt:process.env.GITHUB_RUN_ATTEMPT||null};
await writeFile(`${target}/release-provenance.json`,JSON.stringify(provenance,null,2));
const config=JSON.parse(await readFile('vercel.json','utf8'));
const staticFiles=[...await listTree('dist'),'release-provenance.json'];
await writeFile(`${target}/vercel.json`,JSON.stringify(buildReleaseVercelConfig(config,staticFiles),null,2));
const files=[];async function collect(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await collect(p);else {const data=await readFile(p);files.push({path:path.relative(target,p),sha256:createHash('sha256').update(data).digest('hex')});}}}await collect(target);files.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile(`${target}/release-manifest.json`,JSON.stringify({contractVersion:'1',gitCommit:process.env.GITHUB_SHA||null,files},null,2));console.log(`Packaged ${files.length} files; no fixture data or credentials included.`);
