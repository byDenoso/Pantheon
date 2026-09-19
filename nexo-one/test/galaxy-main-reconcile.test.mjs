import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,writeFile,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

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

test('main production builder keeps the Tower-native compiler and creates bounded versioned history',async()=>{
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
    const env={
      ...process.env,
      NEXO_PUBLIC_PROJECTION:projectionPath,
      NEXO_PUBLIC_PROJECTION_MANIFEST:manifestPath,
      NEXO_PUBLIC_INTERDOMAIN:interdomainPath,
      NEXO_GALAXY_OUT:out,
      NEXO_GALAXY_RETENTION:'4',
    };
    await run(process.execPath,[script],{cwd:temp,env});
    const firstLatest=JSON.parse(await readFile(join(out,'latest.json'),'utf8'));
    assert.equal(firstLatest.provenance.authority,'TOWER_V06');
    assert.equal(firstLatest.provenance.source_fingerprint,first.manifest.projection_fingerprint);
    assert.deepEqual(firstLatest.changes,[]);
    await copyFile(join(out,'latest.json'),join(temp,'previous.json'));

    const second=projection({
      tower:'b'.repeat(40),
      fingerprint:'sha256:'+'2'.repeat(64),
      status:'RUNNING',
    });
    second.manifest.event_cursor='20260919T200000000000Z-test';
    second.manifest.generated_at='2026-09-19T20:00:00.000Z';
    second.event_cursor=second.manifest.event_cursor;
    await writeFile(projectionPath,JSON.stringify(second),'utf8');
    await writeFile(manifestPath,JSON.stringify(second.manifest),'utf8');

    const {stdout}=await run(process.execPath,[script],{
      cwd:temp,
      env:{...env,NEXO_GALAXY_PREVIOUS:join(temp,'previous.json')},
    });
    const summary=JSON.parse(stdout.trim());
    const latest=JSON.parse(await readFile(join(out,'latest.json'),'utf8'));
    const index=JSON.parse(await readFile(join(out,'index.json'),'utf8'));
    assert.equal(summary.previous_snapshot_id,firstLatest.snapshot_id);
    assert.ok(latest.changes.length>=1);
    assert.equal(index.contract,'NEXO_ONE_GALAXY_INDEX_V1');
    assert.equal(index.latest_snapshot_id,latest.snapshot_id);
    assert.equal(index.snapshots.length,2);
    assert.ok(index.snapshots.some(item=>item.snapshot_id===firstLatest.snapshot_id));
    assert.ok(index.snapshots.some(item=>item.snapshot_id===latest.snapshot_id));
    assert.deepEqual(
      JSON.parse(await readFile(join(out,'snapshots',latest.snapshot_id+'.json'),'utf8')),
      latest,
    );
  }finally{
    await rm(temp,{recursive:true,force:true});
  }
});

test('Pages pipeline uses Tower projection authority, two-hour cadence, history hydration and production readback',async()=>{
  const [workflow,builder]=await Promise.all([
    read('../../.github/workflows/nexo-one-pages.yml'),
    read('../scripts/build-galaxy-snapshot.mjs'),
  ]);
  assert.match(workflow,/cron: '17 \*\/2 \* \* \*'/);
  assert.match(workflow,/VITE_GALAXY_ENDPOINT: \.\/galaxy\/latest\.json/);
  assert.match(workflow,/Hydrate previous valid galaxy history/);
  assert.match(workflow,/NEXO_GALAXY_RETENTION: '168'/);
  assert.match(workflow,/GALAXY_VERSIONED_READBACK_MISMATCH/);
  assert.match(workflow,/GALAXY_NOT_BOUND_TO_TOWER_PROJECTION/);
  const readback=workflow.slice(workflow.indexOf('      - name: Read back sanctioned projection'));
  const versionedCurl=readback.indexOf('galaxy/snapshots/\${galaxy_id}.json');
  const versionedRead=readback.indexOf("const galaxyVersioned=JSON.parse");
  assert.ok(versionedCurl>=0&&versionedRead>versionedCurl,'versioned snapshot must be fetched before Node readback');
  assert.match(readback,/grep -Eq '\\^galaxy-\[0-9a-z-\]\\\+\\\
  assert.match(builder,/server\/compiler\/galaxy-v1\.mjs/);
  assert.doesNotMatch(builder,/viewmodels\/galaxyCompiler/);
});

test('frontend labels the SystemState compiler explicitly as fallback while production stays Tower-native',async()=>{
  const [fallback,hook]=await Promise.all([
    read('../src/viewmodels/galaxyCompiler.ts'),
    read('../src/data/useGalaxySnapshot.ts'),
  ]);
  assert.match(hook,/Production truth comes from the sanctioned Tower projection/);
  assert.match(hook,/compileGalaxySnapshot\(state\)/);
  assert.match(fallback,/SystemState/);
});
/);
  assert.match(builder,/server\/compiler\/galaxy-v1\.mjs/);
  assert.doesNotMatch(builder,/viewmodels\/galaxyCompiler/);
});

test('frontend labels the SystemState compiler explicitly as fallback while production stays Tower-native',async()=>{
  const [fallback,hook]=await Promise.all([
    read('../src/viewmodels/galaxyCompiler.ts'),
    read('../src/data/useGalaxySnapshot.ts'),
  ]);
  assert.match(hook,/Production truth comes from the sanctioned Tower projection/);
  assert.match(hook,/compileGalaxySnapshot\(state\)/);
  assert.match(fallback,/SystemState/);
});
