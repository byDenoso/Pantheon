import {mkdir,writeFile} from 'node:fs/promises';
import {readProvider} from '../server/adapters/registry.mjs';
import {compile} from '../server/compiler/world-state.mjs';
import {buildProjectionBus} from '../server/compiler/projection-bus.mjs';
import {buildSystemState} from '../server/compiler/system-state.mjs';
import {normalizePublicSystemState} from '../server/compiler/public-system-state.mjs';

const PUBLIC_PROVIDERS=['github','nexo','drive'];

export async function buildPagesSystemState({env=process.env,now=Date.now(),reader=readProvider}={}){
  const options={now,access:'PUBLIC',env,force:true};
  const results=await Promise.all(PUBLIC_PROVIDERS.map(id=>reader(id,options)));
  const world=compile(results,{now,access:'PUBLIC'}),byId=new Map(results.map(result=>[result.provider.id,result]));
  const truthGraphInput=byId.get('nexo')?.truthGraphInput;
  const systemInput={actions:[],executionRuns:[],sideQuests:[],capabilities:truthGraphInput?.capabilityRows||[],semanticMemory:[],proceduralMemory:[],learningFilaments:[],automationHealth:[]};
  const bus=await buildProjectionBus({env,now,access:'PUBLIC',force:true,reader:async id=>byId.get(id)||reader(id,options)});
  return normalizePublicSystemState(buildSystemState({world,bus,systemInput,now:new Date(now).toISOString()}),world);
}

if(import.meta.url===`file://${process.argv[1]}`){
  const state=await buildPagesSystemState();
  if(!state||typeof state!=='object'||Array.isArray(state)||!state.contract_version)throw new Error('INVALID_PUBLIC_SYSTEM_STATE');
  await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
  await writeFile(new URL('../dist/system.json',import.meta.url),`${JSON.stringify(state,null,2)}\n`,'utf8');
}
