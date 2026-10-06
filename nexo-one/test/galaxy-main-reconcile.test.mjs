import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {compileGalaxySnapshot} from '../server/compiler/galaxy-v1.mjs';
import {sealStaticPublication} from '../scripts/static-publication.mjs';

const run=promisify(execFile);
const repoRoot=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

function projection({tower='a'.repeat(40),fingerprint='sha256:'+'1'.repeat(64),status='READY'}={}){
  const manifest={
    authority:'TOWER_V06',
    event_cursor:'20260919T180000000000Z-test',
    generated_at:'2026-09-19T18:00:00.000Z',
    projection_fingerprint:fingerprint,
    projection_only:true,
    tower_commit:tower,
    tower_repository:'byDenoso/NEXO-Obsidian-Vault',
    writeback:'FORBIDDEN',
  };
  return {
    contract:'NEXO_PUBLIC_PROJECTION_V1',
    event_cursor:manifest.event_cursor,
    manifest,
    work:[{id:'WORK-1',domain:'SCIENCE',status,title:'Work 1'}],
    tests:[{id:'TEST-1',domain:'SCIENCE',status:'QUEUED'}],
    capabilities:{'peer.camb.exact_v2':{status:'ACTIVE'}},
  };
}


test('Tower-native compiler preserves authority and revision changes without publishing data',()=>{
  const first=projection();
  const firstSnapshot=compileGalaxySnapshot({projection:first,manifestFile:first.manifest});
  assert.equal(firstSnapshot.provenance.authority,'TOWER_V06');
  assert.equal(firstSnapshot.provenance.source_fingerprint,first.manifest.projection_fingerprint);
  assert.equal(firstSnapshot.tower_revision,first.manifest.tower_commit);
  assert.deepEqual(firstSnapshot.changes,[]);
  const second=projection({tower:'b'.repeat(40),fingerprint:'sha256:'+'2'.repeat(64),status:'RUNNING'});
  second.manifest.event_cursor='20260919T200000000000Z-test';
  second.manifest.generated_at='2026-09-19T20:00:00.000Z';
  second.event_cursor=second.manifest.event_cursor;
  const current=compileGalaxySnapshot({projection:second,manifestFile:second.manifest,previousSnapshot:firstSnapshot});
  assert.equal(current.provenance.source_fingerprint,second.manifest.projection_fingerprint);
  assert.equal(current.tower_revision,second.manifest.tower_commit);
  assert.notEqual(current.snapshot_id,firstSnapshot.snapshot_id);
  assert.ok(current.changes.length>=1);
  assert.notDeepEqual(current.changes,firstSnapshot.changes);
});

test('public galaxy builder rejects source and history flags; sealing removes stale output without altering private inputs',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'nexo-main-galaxy-'));
  try{
    const data=join(temp,'data');
    const out=join(temp,'dist','galaxy');
    await mkdir(data,{recursive:true});
    const first=projection();
    const projectionPath=join(data,'projection.json');
    const manifestPath=join(data,'manifest.json');
    const interdomainPath=join(data,'interdomain.json');
    await writeFile(projectionPath,JSON.stringify(first),'utf8');
    await writeFile(manifestPath,JSON.stringify(first.manifest),'utf8');
    await writeFile(interdomainPath,'[]','utf8');
    const script=join(repoRoot,'scripts','build-galaxy-snapshot.mjs');
    await assert.rejects(run(process.execPath,[script],{cwd:temp,env:{...process.env,
      NEXO_PUBLIC_PROJECTION:projectionPath,NEXO_PUBLIC_PROJECTION_MANIFEST:manifestPath,
      NEXO_PUBLIC_INTERDOMAIN:interdomainPath,NEXO_GALAXY_OUT:out,
      NEXO_GALAXY_RETENTION:'4',NEXO_GALAXY_PREVIOUS:join(data,'old.json'),
    }}),error=>error.code===1&&/PUBLIC_DATA_PUBLICATION_DISABLED/.test(error.stderr));
    await assert.rejects(access(join(out,'latest.json')),{code:'ENOENT'});
    await assert.rejects(access(join(out,'index.json')),{code:'ENOENT'});

    // Even already-hydrated history must not survive a later shell publication.
    await mkdir(join(out,'snapshots'),{recursive:true});
    for(const name of ['latest.json','index.json','snapshots/galaxy-old.json']){
      await writeFile(join(out,name),'PRIVATE_HISTORICAL_CONTENT');
    }
    await writeFile(join(temp,'dist','index.html'),'<html>shell</html>');
    await sealStaticPublication(join(temp,'dist'));
    for(const name of ['latest.json','index.json','snapshots/galaxy-old.json']){
      await assert.rejects(access(join(out,name)),{code:'ENOENT'});
    }
    assert.deepEqual(JSON.parse(await readFile(projectionPath,'utf8')),first);
    assert.deepEqual(JSON.parse(await readFile(manifestPath,'utf8')),first.manifest);
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('Pages never hydrates or republishes galaxy history and still verifies its absence after deployment',async()=>{
  const [workflow,builder]=await Promise.all([
    read('../../.github/workflows/nexo-one-pages.yml'),
    read('../scripts/build-galaxy-snapshot.mjs'),
  ]);
  assert.doesNotMatch(workflow,/cron:|VITE_GALAXY_ENDPOINT:|NEXO_GALAXY_RETENTION:|NEXO_GALAXY_PREVIOUS/);
  assert.doesNotMatch(workflow,/Hydrate previous valid galaxy history|build-galaxy-snapshot\.mjs/);
  assert.match(workflow,/Verify former data URLs are unavailable/);
  assert.match(workflow,/galaxy\/latest\.json/);
  assert.match(workflow,/galaxy\/index\.json/);
  assert.match(workflow,/403\|404\|410\)/);
  assert.match(workflow,/scripts\/static-publication\.mjs --check/);
  assert.match(builder,/assertPublicDataPublicationAllowed\(\)/);
  assert.ok(builder.indexOf('assertPublicDataPublicationAllowed();')<builder.indexOf('const projection=await readJson'));
  assert.match(builder,/server\/compiler\/galaxy-v1\.mjs/);
  assert.doesNotMatch(builder,/viewmodels\/galaxyCompiler/);
});
