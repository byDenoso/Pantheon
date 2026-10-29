import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTheme,resolveTheme} from '../src/atlas/ui/useTheme.ts';

test('initial appearance honors the saved choice before artwork or loading routes mount',()=>{
 const saved=new Map(['localStorage','window','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{
  for(const systemDark of [false,true])for(const pref of ['light','dark',null,'invalid'])for(const blockedStorage of [false,true]){
   const document={documentElement:{dataset:{}}};
   const values={document,window:{matchMedia:()=>({matches:systemDark})},localStorage:{getItem:key=>{assert.equal(key,'atlas.theme');if(blockedStorage)throw Error('Storage blocked');return pref;}}};
   for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true});
   initializeTheme();
   assert.equal(document.documentElement.dataset.theme,resolveTheme(blockedStorage||!['light','dark'].includes(pref)?'system':pref,systemDark));
  }
 }finally{for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 const entry=readFileSync('src/main.tsx','utf8');
 assert.match(entry,/initializeTheme\(\);\s*createRoot\(/);
});
