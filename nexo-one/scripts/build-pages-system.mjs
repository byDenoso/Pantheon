import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readProvider} from '../server/adapters/registry.mjs';
import {compile} from '../server/compiler/world-state.mjs';
import {buildProjectionBus} from '../server/compiler/projection-bus.mjs';
import {buildSystemState} from '../server/compiler/system-state.mjs';
import {normalizePublicSystemState} from '../server/compiler/public-system-state.mjs';
import {readPublicSystemInput} from '../server/compiler/public-system-input.mjs';

const PUBLIC_PROVIDERS=['github','nexo','drive'];

export async function buildPagesProjection({env=process.env,now=Date.now(),reader=readProvider}={}){
  const options={now,access:'PUBLIC',env,force:true};
  const results=await Promise.all(PUBLIC_PROVIDERS.map(id=>reader(id,options)));
  const world=compile(results,{now,access:'PUBLIC'}),byId=new Map(results.map(result=>[result.provider.id,result]));
  const truthGraphInput=byId.get('nexo')?.truthGraphInput;
  const systemInput=await readPublicSystemInput();
  if(!systemInput.capabilities?.length&&truthGraphInput?.capabilityRows)systemInput.capabilities=truthGraphInput.capabilityRows;
  const bus=await buildProjectionBus({env,now,access:'PUBLIC',force:true,reader:async id=>byId.get(id)||reader(id,options)});
  const system=normalizePublicSystemState(buildSystemState({world,bus,systemInput,now:new Date(now).toISOString()}),world);
  return {system,world};
}

export async function buildPagesSystemState(options={}){
  return (await buildPagesProjection(options)).system;
}

const invokedPath=process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if(import.meta.url===invokedPath){
  const {system,world}=await buildPagesProjection();
  if(!system||typeof system!=='object'||Array.isArray(system)||!system.contract_version)throw new Error('INVALID_PUBLIC_SYSTEM_STATE');
  if(!world||world.version!=='1'||!Array.isArray(world.items)||!Array.isArray(world.providers))throw new Error('INVALID_PUBLIC_WORLD_STATE');
  await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
  await Promise.all([
    writeFile(new URL('../dist/system.json',import.meta.url),`${JSON.stringify(system,null,2)}\n`,'utf8'),
    writeFile(new URL('../dist/world-public.ndjson',import.meta.url),`${JSON.stringify(world)}\n`,'utf8'),
  ]);
}
