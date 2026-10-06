import {readFile,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const DEFAULT_ROOT=fileURLToPath(new URL('../private-ui/',import.meta.url));
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff':'font/woff','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const inside=(root,file)=>file.startsWith(root+path.sep);
// Called only after Atlas session verification. Assets are not under public dist
// and must be included in the server function package by the private UI build.
export async function readPrivateUiAsset(name='index.html',{root=DEFAULT_ROOT}={}){
  if(typeof name!=='string'||name.length>240||! /^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(name)||name.split('/').some(part=>!part||part==='.'||part==='..'))throw new Error('PRIVATE_ASSET_NOT_FOUND');
  const contentType=TYPES[path.extname(name)];if(!contentType)throw new Error('PRIVATE_ASSET_NOT_FOUND');
  let base,manifest;
  try{base=await realpath(root);manifest=JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'));}catch{throw new Error('PRIVATE_UI_NOT_BUILT');}
  if(manifest?.contract!=='ATLAS_PRIVATE_ASSETS_V1'||!manifest.files||typeof manifest.files!=='object'||Array.isArray(manifest.files))throw new Error('PRIVATE_UI_NOT_BUILT');
  const expected=Object.hasOwn(manifest.files,name)?manifest.files[name]:null;
  if(typeof expected!=='string'||!/^[0-9a-f]{64}$/.test(expected))throw new Error('PRIVATE_ASSET_NOT_FOUND');
  let target;
  try{target=await realpath(path.resolve(base,name));}catch{throw new Error('PRIVATE_ASSET_NOT_FOUND');}
  if(!inside(base,target))throw new Error('PRIVATE_ASSET_NOT_FOUND');
  const info=await stat(target);if(!info.isFile()||info.size>10*1024*1024)throw new Error('PRIVATE_ASSET_NOT_FOUND');
  const bytes=await readFile(target);
  if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error('PRIVATE_UI_BUILD_MISMATCH');
  return {bytes,contentType};
}
