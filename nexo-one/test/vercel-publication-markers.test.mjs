import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';

test('Vercel skips publication cursors and still builds code/config changes',()=>{
  const root=mkdtempSync(join(tmpdir(),'nexo-vercel-ignore-'));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  const put=(path,value)=>{mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),value);};
  try{
    git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.test');
    put('nexo-one/src/main.tsx','original');put('nexo-one/tower-head.json','a');put('nexo-one/tcc-public-inbox-ack.json','a');git('add','.');git('commit','-qm','base');
    let previous=git('rev-parse','HEAD');
    const commands=[['../../vercel.json',root],['../vercel.json',join(root,'nexo-one')]].map(([path,cwd])=>({command:JSON.parse(readFileSync(new URL(path,import.meta.url))).ignoreCommand,cwd}));
    const check=expected=>{for(const {command,cwd} of commands){const result=spawnSync('bash',['-c',command],{cwd,env:{...process.env,VERCEL_GIT_PREVIOUS_SHA:previous}});assert.equal(result.status,expected,result.stderr.toString());}};
    put('nexo-one/tower-head.json','b');put('nexo-one/tcc-public-inbox-ack.json','b');git('add','.');git('commit','-qm','publication');check(0);
    previous=git('rev-parse','HEAD');put('nexo-one/src/main.tsx','changed');git('add','.');git('commit','-qm','code');check(1);
    previous='';check(1);
  }finally{rmSync(root,{recursive:true,force:true});}
});
