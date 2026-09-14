import {createHash} from 'node:crypto';

export const ATLAS_SSOT_CONTRACT='NEXO_ATLAS_SSOT_V1';
export const CANONICAL_TAB_MAP=Object.freeze({
 THREADS:'THREADS',WORK:'WORK',EVENTS:'EVENTS',KNOWLEDGE:'KNOWLEDGE',DECISIONS:'DECISIONS',SYSTEM:'SYSTEM',
 PROJECTS:'PROJECTS',TESTS:'TEST_REGISTRY_V1',RELATIONS:'Relations'
});
export const CANONICAL_TABS=Object.freeze(Object.keys(CANONICAL_TAB_MAP));
export const CANONICAL_SOURCE_TABS=Object.freeze(Object.values(CANONICAL_TAB_MAP));
export const PROJECTION_TABS=Object.freeze(['Science','Engineering','Olympus','StructuralLearning','CrossDomain','Integrity']);
const REQUIRED_KEY=Object.freeze({
 THREADS:'thread_id',WORK:'work_id',EVENTS:'event_id',KNOWLEDGE:'knowledge_id',DECISIONS:'decision_id',SYSTEM:'system_id',
 PROJECTS:'record_id',TESTS:'metatest_id',RELATIONS:'relation_id'
});

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

function normalizeProjectionTable(values){
 if(!Array.isArray(values)||!Array.isArray(values[0])||values[0].length===0)return [];
 const rawHeaders=values[0].map(text);
 const headers=rawHeaders.map((header,index)=>header||(index===0?'record_type':`column_${index+1}`));
 return values.slice(1).filter(row=>Array.isArray(row)&&row.some(value=>text(value))).map(row=>Object.fromEntries(headers.map((header,index)=>[header,text(row[index])])));
}

function semanticFingerprint({sourceFileId,sections,projections}){
 const semantic={contract:ATLAS_SSOT_CONTRACT,sourceFileId,sections,projections};
 return `sha256:${createHash('sha256').update(JSON.stringify(semantic)).digest('hex')}`;
}

export function buildAtlasSsotSnapshot({tables,projectionTables={},sourceFileId,sourceModifiedAt='',generatedAt=new Date().toISOString()}={}){
 if(!tables||typeof tables!=='object'||!text(sourceFileId))throw new Error('INVALID_SSOT_SOURCE');
 const sections={};
 for(const tab of CANONICAL_TABS)sections[tab]=normalizeTable(tab,tables[tab]);
 const projections={};
 for(const tab of PROJECTION_TABS)projections[tab]=normalizeProjectionTable(projectionTables?.[tab]);
 const fingerprint=semanticFingerprint({sourceFileId:text(sourceFileId),sections,projections});
 return {
  contract:ATLAS_SSOT_CONTRACT,
  authority:'GOOGLE_DRIVE',
  projectionAuthority:'DERIVED_FROM_SSOT',
  projectionOnly:true,
  sourceFileId:text(sourceFileId),
  sourceModifiedAt:text(sourceModifiedAt),
  generatedAt:text(generatedAt),
  fingerprint,
  sections,
  projections,
  counts:{...Object.fromEntries(CANONICAL_TABS.map(tab=>[tab,sections[tab].length])),...Object.fromEntries(PROJECTION_TABS.map(tab=>[tab,projections[tab].length]))}
 };
}
