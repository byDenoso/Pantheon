import {json} from './http.mjs';
import {googleToken} from './google.mjs';
import {buildAtlasSsotSnapshot,CANONICAL_TABS,PROJECTION_TABS} from '../compiler/atlas-ssot.mjs';

const CANONICAL_SSOT_ID='1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY';

export async function readAtlasSsot({env=process.env,signal,now=Date.now()}={}){
 const sourceFileId=CANONICAL_SSOT_ID;
 const token=await googleToken(env,signal);
 const requested=[...CANONICAL_TABS,...PROJECTION_TABS];
 const params=new URLSearchParams();
 for(const tab of requested)params.append('ranges',`${tab}!A1:Z5000`);
 params.set('majorDimension','ROWS');
 params.set('valueRenderOption','FORMATTED_VALUE');
 const [batch,meta]=await Promise.all([
  json(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sourceFileId)}/values:batchGet?${params}`,{token,signal}),
  json(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sourceFileId)}?fields=id,name,modifiedTime,version`,{token,signal})
 ]);
 const valueRanges=Array.isArray(batch?.valueRanges)?batch.valueRanges:[];
 const byTab={};
 for(let i=0;i<requested.length;i++)byTab[requested[i]]=valueRanges[i]?.values||[];
 const tables=Object.fromEntries(CANONICAL_TABS.map(tab=>[tab,byTab[tab]]));
 const projectionTables=Object.fromEntries(PROJECTION_TABS.map(tab=>[tab,byTab[tab]]));
 return buildAtlasSsotSnapshot({tables,projectionTables,sourceFileId,sourceModifiedAt:meta?.modifiedTime||'',generatedAt:new Date(now).toISOString()});
}
