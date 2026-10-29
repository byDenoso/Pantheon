// Explicit optional integration test against the audited existing Python module.
// Usage: node test/local-memory.integration.mjs /path/to/nexo-memory-code
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,cp,stat,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {memoryFixture} from './helpers/memory.fixture.mjs';
import {queryLocalMemoryGraph} from '../scripts/query-memory-graph.mjs';
import {canonicalDigest} from '../server/atlas/json-stream.mjs';

if (!process.argv[2]) throw new Error('AUDITED_MEMORY_SOURCE_PATH_REQUIRED');
const dir=await mkdtemp(join(tmpdir(),'nexo-vector-graph-'));
try {
  const towerPath=join(dir,'tower.json'),cachePath=join(dir,'derived.sqlite');
  await writeFile(towerPath,JSON.stringify(memoryFixture()));
  const before=await readFile(towerPath);
  const options={memorySource:process.argv[2],towerPath,cachePath,role:'LEARNER',query:'expansion cosmological Hubble'};
  const result=await queryLocalMemoryGraph(options);
  assert.ok(before.equals(await readFile(towerPath)));
  assert.equal(result.retrieval.mode,'hybrid');assert.equal(result.retrieval.method,'lsa');
  assert.ok(result.hits.length>0);assert.ok(result.graph.edges.length>0);assert.equal(result.applied,false);
  assert.equal(result.source_revision,JSON.parse(before).revision);assert.equal(result.tower_mutation,false);
  assert.ok(result.hits.every(hit=>hit.node.citation.tower_revision===result.source_revision));
  const repeated=await queryLocalMemoryGraph(options);
  assert.deepEqual(repeated,result);assert.ok(before.equals(await readFile(towerPath)));
  await assert.rejects(()=>queryLocalMemoryGraph({...options,cachePath:towerPath}),/LOCAL_MEMORY_CACHE_PATH_INVALID/);
  const alias=join(dir,'source-hardlink.sqlite'),mode=(await stat(towerPath)).mode;
  await link(towerPath,alias);
  await assert.rejects(()=>queryLocalMemoryGraph({...options,cachePath:alias}),/LOCAL_MEMORY_CACHE_PATH_INVALID/);
  assert.equal((await stat(towerPath)).mode,mode);
  const sourceCopy=join(dir,'source-with-extra-module'),marker=join(dir,'untrusted-module-ran');
  await cp(process.argv[2],sourceCopy,{recursive:true});
  await writeFile(join(sourceCopy,'gzip.py'),`from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text('must not run')\n`);
  await queryLocalMemoryGraph({...options,memorySource:sourceCopy});
  await assert.rejects(()=>stat(marker),{code:'ENOENT'});
  const restricted=memoryFixture();restricted.files['entities/hypothesis/H-1.json'].value.allowed_roles=['ENGINEER'];restricted.files['entities/hypothesis/H-1.json'].value.title='ENGINEER_ONLY_SYNTHETIC';
  restricted.revision=restricted.state_fingerprint=canonicalDigest(restricted.files);
  const restrictedPath=join(dir,'restricted-tower.json');await writeFile(restrictedPath,JSON.stringify(restricted));
  const scoped=await queryLocalMemoryGraph({...options,towerPath:restrictedPath,cachePath:join(dir,'restricted.sqlite'),query:'expansion'});
  assert.equal(JSON.stringify(scoped).includes('HYPOTHESIS::H-1'),false);
  assert.equal(JSON.stringify(scoped).includes('ENGINEER_ONLY_SYNTHETIC'),false);
  process.stdout.write(JSON.stringify({passed:true,source:'SYNTHETIC_CANONICAL_TOWER',module:result.memory_module,
    method:result.retrieval.method,hits:result.hits.length,nodes:result.graph.nodes.length,edges:result.graph.edges.length,
    revision_match:true,tower_bytes_unchanged:true,repeat_deterministic:true,role_scope_preserved:true,
    unpinned_modules_not_executed:true,source_hardlink_refused:true,applied:result.applied})+'\n');
} finally {await rm(dir,{recursive:true,force:true});}
