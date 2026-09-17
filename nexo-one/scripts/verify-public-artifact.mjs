import {readdir,readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=resolve(process.argv[2]||new URL('../dist/',import.meta.url).pathname);
const forbidden=[
  ['23','01'].join(''),
  'NEXO_PASSWORD_HASH',
  'NEXO_SESSION_SECRET',
  'nexo_session=',
  'scrypt$',
  'GOOGLE_CLIENT_SECRET',
  'VERCEL_TOKEN'
];

async function files(dir){
  const out=[];
  for(const name of await readdir(dir)){
    const path=resolve(dir,name),info=await stat(path);
    if(info.isDirectory())out.push(...await files(path));
    else out.push(path);
  }
  return out;
}

const violations=[];
for(const path of await files(root)){
  let body;
  try{body=await readFile(path,'utf8');}catch{continue;}
  for(const marker of forbidden)if(body.includes(marker))violations.push({path,marker:marker==='scrypt$'?'scrypt-hash-prefix':marker});
}
if(violations.length){
  console.error('PUBLIC_ARTIFACT_SECRET_LEAK',JSON.stringify(violations));
  process.exitCode=1;
}else console.log('PUBLIC_ARTIFACT_ISOLATION: PASS');
