import {json} from './http.mjs';
import {googleToken} from './google.mjs';
import {buildAtlasSsotSnapshot,CANONICAL_TAB_MAP,CANONICAL_SOURCE_TABS,PROJECTION_TABS} from '../compiler/atlas-ssot.mjs';

const DEFAULT_SSOT_NAME='DENER · SSOT CANONICAL';

export function resolveAtlasSsotId(env=process.env){
 const value=String(env?.DRIVE_SSOT_SPREADSHEET_ID||'').trim();
 return value||null;
}

export function selectAtlasSsotFile(files,name=DEFAULT_SSOT_NAME){
 const matches=(Array.isArray(files)?files:[]).filter(file=>String(file?.name||'').trim()===name);
 if(matches.length===0)throw new Error(`SSOT_DISCOVERY_NOT_FOUND:${name}`);
 if(matches.length!==1)throw new Error(`SSOT_DISCOVERY_AMBIGUOUS:${name}:${matches.length}`);
 return matches[0];
}

async function discoverAtlasSsotId({env,token,signal}){
 const name=String(env?.DRIVE_SSOT_NAME||DEFAULT_SSOT_NAME).trim()||DEFAULT_SSOT_NAME;
 const q=[`name = '${name.replaceAll("'","\\'")}'`,`mimeType = 'application/vnd.google-apps.spreadsheet'`,`trashed = false`];
 const folder=String(env?.GOOGLE_DRIVE_FOLDER_ID||'').trim();
 if(folder)q.push(`'${folder.replaceAll("'","\\'")}' in parents`);
 const params=new URLSearchParams({q:q.join(' and '),spaces:'drive',pageSize:'10',fields:'files(id,name,modifiedTime,version)'});
 const listing=await json(`https://www.googleapis.com/drive/v3/files?${params}`,{token,signal});
 return selectAtlasSsotFile(listing?.files,name).id;
}

export async function readAtlasSsot({env=process.env,signal,now=Date.now()}={}){
 const token=await googleToken(env,signal);
 const sourceFileId=resolveAtlasSsotId(env)||await discoverAtlasSsotId({env,token,signal});
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
