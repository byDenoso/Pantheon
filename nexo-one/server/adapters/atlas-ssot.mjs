import {json,requireEnv} from './http.mjs';
import {googleToken} from './google.mjs';
import {buildAtlasSsotSnapshot,CANONICAL_TABS} from '../compiler/atlas-ssot.mjs';

const DEFAULT_SSOT_ID='1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY';

export async function readAtlasSsot({env=process.env,signal,now=Date.now()}={}){
 const sourceFileId=env.NEXO_SSOT_ID||env.NEXO_SHEET_ID||DEFAULT_SSOT_ID;
 requireEnv({...env,NEXO_SSOT_ID:sourceFileId},'NEXO_SSOT_ID');
 const token=await googleToken(env,signal);
 const params=new URLSearchParams();
 for(const tab of CANONICAL_TABS)params.append('ranges',`${tab}!A1:Z5000`);
 params.set('majorDimension','ROWS');
 params.set('valueRenderOption','FORMATTED_VALUE');
 const [batch,meta]=await Promise.all([
  json(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sourceFileId)}/values:batchGet?${params}`,{token,signal}),
  json(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sourceFileId)}?fields=id,name,modifiedTime,version`,{token,signal})
 ]);
 const valueRanges=Array.isArray(batch?.valueRanges)?batch.valueRanges:[];
 const tables={};
 for(let i=0;i<CANONICAL_TABS.length;i++)tables[CANONICAL_TABS[i]]=valueRanges[i]?.values||[];
 return buildAtlasSsotSnapshot({
  tables,
  sourceFileId,
  sourceModifiedAt:meta?.modifiedTime||'',
  generatedAt:new Date(now).toISOString()
 });
}
