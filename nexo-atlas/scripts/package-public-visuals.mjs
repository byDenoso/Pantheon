import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validatePublicVisualSnapshot,bindPublicVisuals} from '../server/atlas/public-visual-projection.mjs';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
import {campaignPublicProjection} from '../worker/public-campaigns.mjs';
import {publicEditorialProjection} from '../worker/public-editorial.mjs';
await mkdir('.sites-runtime',{recursive:true});
let snapshot=null;
try{
  const bytes=await readFile('worker/public-visuals.approved.json');
  if(bytes.byteLength>8*1024*1024)throw new Error('PUBLIC_VISUAL_SNAPSHOT_TOO_LARGE');
  snapshot=validatePublicVisualSnapshot(JSON.parse(bytes));
  bindPublicVisuals(snapshot,publicEditorialProjection(campaignPublicProjection(publicAtlasProjection())));
  for(const visual of snapshot.visuals){if(!visual.image)continue;
    const bytes=await readFile('public-extra'+visual.image.path);
    if(bytes.byteLength>8*1024*1024||createHash('sha256').update(bytes).digest('hex')!==visual.image.sha256)throw new Error('PUBLIC_VISUAL_ASSET_MISMATCH');
    const valid=visual.image.path.endsWith('.png')?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):visual.image.path.endsWith('.jpg')?bytes[0]===255&&bytes[1]===216:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if(!valid)throw new Error('PUBLIC_VISUAL_ASSET_TYPE');
  }
}catch(error){if(error.code!=='ENOENT'||snapshot!==null)throw error;}
const allowed=new Set((snapshot?.visuals??[]).flatMap(v=>v.image?[v.image.path]:[]));
const entries=await readdir('public-extra/assets').catch(error=>{if(error.code==='ENOENT')return [];throw error;});
for(const name of entries)if(name.startsWith('research-')&&!allowed.has('/assets/'+name))throw new Error('PUBLIC_VISUAL_ASSET_UNAPPROVED');
await writeFile('.sites-runtime/public-visual-snapshot.mjs',`export default ${JSON.stringify(snapshot)};\n`);
console.log(snapshot?'Approved Writer figures validated for packaging':'No approved figures: keeping the public gallery empty');
