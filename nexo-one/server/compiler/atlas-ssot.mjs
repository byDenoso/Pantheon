import {createHash} from 'node:crypto';

export const ATLAS_SSOT_CONTRACT='NEXO_ATLAS_SSOT_V1';
export const CANONICAL_TABS=Object.freeze(['THREADS','WORK','EVENTS','KNOWLEDGE','DECISIONS','SYSTEM']);
const REQUIRED_KEY=Object.freeze({THREADS:'thread_id',WORK:'work_id',EVENTS:'event_id',KNOWLEDGE:'knowledge_id',DECISIONS:'decision_id',SYSTEM:'system_id'});

const text=value=>String(value??'').trim();

function normalizeTable(tab,values){
 if(!Array.isArray(values)||!Array.isArray(values[0])||values[0].length===0)throw new Error(`INVALID_CANONICAL_TAB:${tab}`);
 const headers=values[0].map(text);
 if(!headers.includes(REQUIRED_KEY[tab]))throw new Error(`INVALID_CANONICAL_TAB:${tab}`);
 const rows=[];
 for(const row of values.slice(1)){
  if(!Array.isArray(row)||row.every(value=>!text(value)))continue;
  const record=Object.fromEntries(headers.map((header,index)=>[header,text(row[index])]));
  if(!record[REQUIRED_KEY[tab]])throw new Error(`INVALID_CANONICAL_ROW:${tab}`);
  rows.push(record);
 }
 return rows;
}

function semanticFingerprint({sourceFileId,sections}){
 const semantic={contract:ATLAS_SSOT_CONTRACT,sourceFileId,sections};
 return `sha256:${createHash('sha256').update(JSON.stringify(semantic)).digest('hex')}`;
}

export function buildAtlasSsotSnapshot({tables,sourceFileId,sourceModifiedAt='',generatedAt=new Date().toISOString()}={}){
 if(!tables||typeof tables!=='object'||!text(sourceFileId))throw new Error('INVALID_SSOT_SOURCE');
 const sections={};
 for(const tab of CANONICAL_TABS)sections[tab]=normalizeTable(tab,tables[tab]);
 const fingerprint=semanticFingerprint({sourceFileId:text(sourceFileId),sections});
 return {
  contract:ATLAS_SSOT_CONTRACT,
  authority:'GOOGLE_DRIVE',
  projectionOnly:true,
  sourceFileId:text(sourceFileId),
  sourceModifiedAt:text(sourceModifiedAt),
  generatedAt:text(generatedAt),
  fingerprint,
  sections,
  counts:Object.fromEntries(CANONICAL_TABS.map(tab=>[tab,sections[tab].length]))
 };
}
