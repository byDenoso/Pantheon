import { assertStaticPublication } from './static-publication.mjs';
import {mkdir,readFile,readdir,writeFile,rm,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {buildReleaseVercelConfig} from './release-config.mjs';
// Refuse to package stale projections or private research embedded in assets.
await assertStaticPublication('dist');
const target='release';await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
async function copyTree(source,dest,filter=()=>true){for(const e of await readdir(source,{withFileTypes:true})){const s=path.join(source,e.name),d=path.join(dest,e.name);if(e.isDirectory()){await mkdir(d,{recursive:true});await copyTree(s,d,filter);}else if(filter(s)){await mkdir(path.dirname(d),{recursive:true});await copyFile(s,d);}}}
async function listTree(source,root=source){const out=[];for(const e of await readdir(source,{withFileTypes:true})){const p=path.join(source,e.name);if(e.isDirectory())out.push(...await listTree(p,root));else out.push(path.relative(root,p).split(path.sep).join('/'));}return out;}
await copyTree('dist',target);await copyTree('server',`${target}/server`);await copyTree('src/contracts',`${target}/src/contracts`,p=>p.endsWith('.mjs'));await copyTree('api',`${target}/api`);
// Preserve the private research reader's compiler and publication-policy import
// closure. Neither compiler imports private source files as static assets.
await mkdir(`${target}/scripts`,{recursive:true});
for(const file of ['build-pages-system.mjs','science-projection-v1.mjs','static-publication.mjs'])await copyFile(`scripts/${file}`,`${target}/scripts/${file}`);
const sourcePackage=JSON.parse(await readFile('package.json','utf8'));
await writeFile(`${target}/package.json`,JSON.stringify({name:sourcePackage.name,version:sourcePackage.version,
  private:true,type:sourcePackage.type,engines:sourcePackage.engines,dependencies:sourcePackage.dependencies},null,2));
await copyFile('package-lock.json',`${target}/package-lock.json`);
const config=JSON.parse(await readFile('vercel.json','utf8'));
const staticFiles=await listTree('dist');
await writeFile(`${target}/vercel.json`,JSON.stringify(buildReleaseVercelConfig(config,staticFiles),null,2));
const files=[];async function collect(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await collect(p);else {const data=await readFile(p);files.push({path:path.relative(target,p),sha256:createHash('sha256').update(data).digest('hex')});}}}await collect(target);files.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile(`${target}/release-manifest.json`,JSON.stringify({contractVersion:'1',gitCommit:process.env.GITHUB_SHA||null,files},null,2));console.log(`Packaged ${files.length} files; no fixture data or credentials included.`);
