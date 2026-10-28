import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const read=rel=>readFileSync(resolve(here,rel),'utf8');

test('Atlas runtime fails closed instead of serving or relabeling Drive fallback',()=>{
  const runtime=read('../api/runtime-github.js');
  const authority=read('../lib/github-authority.mjs');
  assert.doesNotMatch(runtime,/driveRoute/);
  assert.doesNotMatch(runtime,/LEGACY_GOOGLE_DRIVE_SNAPSHOT/);
  assert.match(runtime,/TOWER_PROJECTION_UNAVAILABLE/);
  assert.match(runtime,/,503,\{noStore:true\}\)/);
  assert.match(authority,/ATLAS_LEGACY_DRIVE_PROJECTION_RETIRED/);
});

// Root/nexo-one publication-marker behavior is covered by
// nexo-one/test/vercel-publication-markers.test.mjs. Test Atlas behavior here,
// rather than freezing the obsolete spelling of all three shell commands.
test('Atlas build scope and missing-history behavior',async t=>{
  const command=JSON.parse(read('../vercel.json')).ignoreCommand;
  const root=mkdtempSync(resolve(tmpdir(),'atlas-build-scope-'));
  const cwd=resolve(root,'atlas-control-tower');
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  const put=(path,value)=>{
    const file=resolve(root,path);
    mkdirSync(dirname(file),{recursive:true});writeFileSync(file,value);
  };
  const check=(previous,expected)=>{
    const result=spawnSync('bash',['-c',command],{
      cwd,env:{...process.env,VERCEL_GIT_PREVIOUS_SHA:previous},encoding:'utf8',
    });
    assert.ifError(result.error);
    assert.equal(result.status,expected,result.stderr);
  };
  try{
    git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.test');
    put('atlas-control-tower/src/app.js','original');git('add','.');git('commit','-qm','base');
    let previous=git('rev-parse','HEAD');
    await t.test('unchanged project skips build',()=>check(previous,0));
    await t.test('operational files outside Atlas skip build',()=>{
      put('scripts/maintenance.py','changed');git('add','.');git('commit','-qm','operations');
      check(previous,0);
    });
    await t.test('Atlas source changes require build',()=>{
      previous=git('rev-parse','HEAD');
      put('atlas-control-tower/src/app.js','changed');git('add','.');git('commit','-qm','source');
      check(previous,1);
    });
    await t.test('Atlas configuration changes require build',()=>{
      previous=git('rev-parse','HEAD');
      put('atlas-control-tower/vercel.json','{}');git('add','.');git('commit','-qm','config');
      check(previous,1);
    });
    await t.test('missing previous SHA does not skip build',()=>check('',1));
    await t.test('unavailable previous commit does not skip build',()=>check('f'.repeat(40),1));
  }finally{rmSync(root,{recursive:true,force:true});}
});
