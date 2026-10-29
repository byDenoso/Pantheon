#!/usr/bin/env node
// Offline adapter; deliberately NOT imported by Worker or any browser bundle.
// Uses the already delivered, pinned Python memory implementation. Writes only
// the caller-selected rebuildable cache; never Tower, Drive, scheduler or Writer.
import {spawn} from 'node:child_process';
import {readFile, realpath, lstat, mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {resolve, dirname, basename} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {integrateMemoryGraph} from '../server/atlas/memory-graph-bridge.mjs';

const HASHES = {
  'runtime/__init__.py':'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'runtime/nexo_agent_api/__init__.py':'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'runtime/nexo_agent_api/live_tower.py':'b848a323db345a2cd6a03f3c593390c9ccc8cbdd97b6ed8aaf023f938a01c4fb',
  'runtime/nexo_agent_api/memory.py':'a938fb39069cf60e3911272329a2d40ba49cfe27726ae1ebaa08c93fe111333c',
  'runtime/nexo_agent_api/tower_paths.py':'d21d5a276870b19ab44390051c3f532be6584665ac55508dbc589c69f26d2586',
};
const PYTHON = `import json,sys
args=json.load(sys.stdin)
sys.path.insert(0,args['memorySource'])
from runtime.nexo_agent_api.memory import Memory, Snapshot, VERSION, Document
from datetime import datetime,timezone
if VERSION != 'nexo-memory-1.0.1': raise ValueError('MEMORY_VERSION_MISMATCH')
snapshot=Snapshot.read(args['towerPath'])
memory=Memory(args['cachePath'])
memory.sync(snapshot)
result=memory.search(args['query'],args['role'],k=8,expected_revision=snapshot.revision,mode='hybrid')
result.setdefault('mode','hybrid')
selected,generation=memory.select(expected_revision=snapshot.revision)
at=datetime.now(timezone.utc).isoformat()
result['role_scope']={'role':result['role'],'source_revision':snapshot.revision,
  'eligible_ids':[data['uid'] for data in generation['documents'] if memory.eligible(Document(**data),result['role'],at)]}
print(json.dumps(result,ensure_ascii=False,allow_nan=False))
`;

export async function queryLocalMemoryGraph({memorySource,towerPath,cachePath,role,query}) {
  if (![memorySource,towerPath,cachePath,role,query].every(v=>typeof v==='string'&&v.length) || query.length>256 || !['PITIA','LEARNER','ENGINEER','EXECUTOR','REFEREE_1','GUARDIAO','SENTINEL'].includes(role)) throw new Error('LOCAL_MEMORY_ARGUMENTS_INVALID');
  memorySource=await realpath(memorySource);towerPath=await realpath(towerPath);
  cachePath=resolve(await realpath(dirname(resolve(cachePath))),basename(cachePath));
  // SQLite changes file permissions and may write WAL/journal sidecars. Reject
  // aliases, hardlinks and non-files before any provider code touches them.
  for (const path of [cachePath,cachePath+'-wal',cachePath+'-shm',cachePath+'-journal']) {
    try {const info=await lstat(path);if(!info.isFile() || info.nlink>1)throw new Error('LOCAL_MEMORY_CACHE_PATH_INVALID');}
    catch(error) {if(error.code!=='ENOENT')throw error;}
  }
  if (cachePath===towerPath || cachePath.startsWith(memorySource+'/')) throw new Error('LOCAL_MEMORY_CACHE_PATH_INVALID');
  const sources=[];
  for (const [file,hash] of Object.entries(HASHES)) {const bytes=await readFile(resolve(memorySource,file));if(createHash('sha256').update(bytes).digest('hex')!==hash) throw new Error('PINNED_MEMORY_SOURCE_MISMATCH');sources.push([file,bytes]);}
  const raw=await readFile(towerPath);if(raw.byteLength>16*1024*1024)throw new Error('TOWER_TOO_LARGE');
  const tower=JSON.parse(raw);
  // The original directory can contain unpinned modules or cached bytecode.
  // Import only a new private tree populated with the exact verified bytes.
  const staged=await mkdtemp(resolve(tmpdir(),'nexo-pinned-memory-'));
  let result;
  try {
    for(const [file,bytes] of sources){const path=resolve(staged,file);await mkdir(dirname(path),{recursive:true,mode:0o700});await writeFile(path,bytes,{mode:0o600});}
    result=await new Promise((yes,no)=>{
    const child=spawn('python3',['-I','-B','-c',PYTHON],{stdio:['pipe','pipe','pipe']});
    let output='',size=0,settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?no(error):yes(value);};
    const timer=setTimeout(()=>{child.kill('SIGTERM');finish(new Error('LOCAL_MEMORY_TIMEOUT'));},120000);
    child.on('error',()=>finish(new Error('LOCAL_MEMORY_PROCESS_UNAVAILABLE')));
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){child.kill('SIGTERM');finish(new Error('LOCAL_MEMORY_OUTPUT_TOO_LARGE'));}else output+=chunk;});
    child.stderr.resume(); // Do not echo arbitrary source data or paths into logs.
    child.stdin.on('error',()=>{});
    child.on('close',code=>{if(code!==0)return finish(new Error('LOCAL_MEMORY_QUERY_FAILED'));try{finish(null,JSON.parse(output));}catch{finish(new Error('LOCAL_MEMORY_RESULT_INVALID'));}});
    child.stdin.end(JSON.stringify({memorySource:staged,towerPath,cachePath,role,query}));
    });
  } finally {await rm(staged,{recursive:true,force:true});}
  // Detect replacement while Python was reading. Python independently verifies
  // the canonical fingerprint of the exact source it uses.
  if (!raw.equals(await readFile(towerPath))) throw new Error('LOCAL_MEMORY_SOURCE_CHANGED');
  return {...integrateMemoryGraph(tower,result),tower_mutation:false,
    local_cache:{storage:'DERIVED_SQLITE',may_rebuild:true,canonical:false}};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];if(!['--memory-source','--tower','--cache','--role','--query'].includes(key)||!process.argv[i+1]||Object.hasOwn(args,key))throw new Error('LOCAL_MEMORY_ARGUMENTS_INVALID');args[key]=process.argv[i+1];}
    const result=await queryLocalMemoryGraph({memorySource:args['--memory-source'],towerPath:args['--tower'],cachePath:args['--cache'],role:args['--role'],query:args['--query']});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  } catch(error) {process.stderr.write((/^[A-Z0-9_]+$/.test(error.message)?error.message:'LOCAL_MEMORY_FAILED')+'\n');process.exitCode=1;}
}
