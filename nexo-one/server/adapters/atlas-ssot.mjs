import {json} from './http.mjs';
import {googleToken} from './google.mjs';
import {buildAtlasSsotSnapshot,CANONICAL_TAB_MAP,CANONICAL_SOURCE_TABS,PROJECTION_TABS} from '../compiler/atlas-ssot.mjs';

export function resolveAtlasSsotId(env=process.env){
 const value=String(env?.DRIVE_SSOT_SPREADSHEET_ID||'').trim();
 if(!value)throw new Error('CONFIG_MISSING:DRIVE_SSOT_SPREADSHEET_ID');
 return value;
}

export async function readAtlasSsot({env=process.env,signal,now=Date.now()}={}){
 const sourceFileId=resolveAtlasSsotId(env);
 const token=await googleToken(env,signal);
 const requested=[...CANONICAL_SOURCE_TABS,...PROJECTION_TABS];
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
 const tables=Object.fromEntries(Object.entries(CANONICAL_TAB_MAP).map(([logical,physical])=>[logical,byTab[physical]]));
 const projectionTables=Object.fromEntries(PROJECTION_TABS.map(tab=>[tab,byTab[tab]]));
 return buildAtlasSsotSnapshot({tables,projectionTables,sourceFileId,sourceModifiedAt:meta?.modifiedTime||'',generatedAt:new Date(now).toISOString()});
}
