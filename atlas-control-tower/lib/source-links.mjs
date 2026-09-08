export const TOWER_ID='1Y9YYAn2x0NDIBTbl1bvkwBbSEGz6kHLxzAl90SQ0-GA';
export const ACTION_REGISTER_ID='1twRpSoZCOXv77YyCh_5V9nAS2PM2nqzex2A37eI2Zas';
export const LEARNING_DRIVE_ID='1to_VBC5edy3kHbkn4CDjG2r33tr0jdtky2Ie80afbEI';

export const TOWER_SHEET_GIDS=Object.freeze({
  'SCIENTIFIC_CAMPAIGNS':2026090401,
  'PUBLICATIONS':2026082902,
  'Test Registry':200000001,
  'Result Envelopes':200000012,
  'Hypothesis Registry':200000013,
});

export const ACTION_REGISTER_GIDS=Object.freeze({
  ACTIONS:940319257,
  JOURNAL_CURSOR:1040567299,
  AUTOMATION_HEALTH:259405573,
  NOTIFICATION_OUTBOX:317004911,
  COMMITMENT_INGRESS:317004912,
  CONTINUITY_CURSOR:317004913,
  VALUE_METRICS:317004914,
  CANDIDATES:317004915,
  SYSTEM_CONTROL:1728736690,
  AUTHORITY_MATRIX:337426832,
  ACTIONS_SCIENCE:328645750,
  ACTIONS_ENGINEERING:718507450,
  ACTIONS_OLYMPUS:979087131,
  ACTION_INDEX:2145402813,
  SIGNAL_LEDGER:2072417801,
  CAPABILITY_MATRIX:579884733,
  EFFECT_LEDGER:35435384,
  EXECUTION_RUNS:1195883185,
  CLAUDE_HANDOFF:1609032026,
  RELATION_LEDGER:1551793935,
  LEARNING_CURSOR:1939117934,
  PROCEDURAL_MEMORY:2100000001,
  ADAPTIVE_POLICY:2100000002,
  STRATEGY_REGISTRY:2100000003,
  SKILL_EVOLUTION:2100000004,
});

const DRIVE_ID=/^[A-Za-z0-9_-]{20,}$/;
const compact=v=>String(v??'').trim();
const unique=items=>{
  const out=[],seen=new Set();
  for(const item of items.filter(Boolean)){
    const key=`${item.source||''}|${item.sourceId||''}|${item.url||item.sourceRef||''}`;
    if(seen.has(key))continue;seen.add(key);out.push(item);
  }
  return out;
};

function splitSheetRef(value=''){
  const raw=compact(value);if(!raw)return null;
  const bang=raw.lastIndexOf('!');
  if(bang<0)return{sheet:raw.replace(/^'|'$/g,''),range:''};
  return{sheet:raw.slice(0,bang).replace(/^'|'$/g,''),range:raw.slice(bang+1)};
}
function sheetUrl(fileId,gid,range=''){
  const hash=`gid=${gid}${range?`&range=${encodeURIComponent(range)}`:''}`;
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(fileId)}/edit#${hash}`;
}
function driveUrl(id){return `https://drive.google.com/open?id=${encodeURIComponent(id)}`}
function docRef({source,sourceId,sourceRef,url,observedAt}){
  return{source,sourceId,sourceRef:sourceRef||sourceId,url,observedAt:observedAt||undefined};
}
function idsFromText(value=''){
  const raw=compact(value),ids=[];
  for(const re of [/(?:DriveDoc:|Drive prereg\s+|result\s+)([A-Za-z0-9_-]{20,})/gi,/https?:\/\/(?:docs\.google\.com\/(?:document|spreadsheets)\/d\/|drive\.google\.com\/(?:file\/d\/|open\?id=))([A-Za-z0-9_-]{20,})/gi]){
    let m;while((m=re.exec(raw)))ids.push(m[1]);
  }
  if(DRIVE_ID.test(raw))ids.push(raw);
  return [...new Set(ids)];
}

export function mergeSourceRefs(...groups){return unique(groups.flat().filter(Boolean))}

export function scienceSourceRefs(row={}){
  const surface=compact(row.source_surface),key=compact(row.source_row_key),observedAt=row.observed_at||row.updated_at||'';
  const parsed=splitSheetRef(key);
  if(TOWER_SHEET_GIDS[surface]&&parsed){
    const range=parsed.range||'';
    return[docRef({source:'PEER_CONTROL_TOWER_FROZEN',sourceId:TOWER_ID,sourceRef:key,url:sheetUrl(TOWER_ID,TOWER_SHEET_GIDS[surface],range),observedAt})];
  }
  if(/^https:\/\//i.test(key))return[docRef({source:surface||'GOOGLE_DRIVE',sourceRef:key,url:key,observedAt})];
  const ids=idsFromText(key);
  if(ids.length&&(surface==='Drive result document'||surface==='NEXO_DIRECT_EXECUTION'||surface==='NEXO_INTERACTIVE')){
    return ids.map(id=>docRef({source:'GOOGLE_DRIVE',sourceId:id,sourceRef:key||id,url:driveUrl(id),observedAt}));
  }
  return[];
}

function knownSpreadsheetRef(fileId,ref,source,observedAt){
  const parsed=splitSheetRef(ref);if(!parsed)return null;
  const map=fileId===TOWER_ID?TOWER_SHEET_GIDS:fileId===ACTION_REGISTER_ID?ACTION_REGISTER_GIDS:null;
  const gid=map?.[parsed.sheet];
  if(gid==null)return docRef({source,sourceId:fileId,sourceRef:ref,url:`https://docs.google.com/spreadsheets/d/${encodeURIComponent(fileId)}/edit`,observedAt});
  return docRef({source,sourceId:fileId,sourceRef:ref,url:sheetUrl(fileId,gid,parsed.range),observedAt});
}

export function opsSourceRefs(row={}){
  const kind=compact(row.source_kind).toUpperCase(),sourceId=compact(row.source_id),ref=compact(row.source_ref),observedAt=row.observed_at||row.occurred_at||row.updated_at||'';
  if(/^https:\/\//i.test(ref))return[docRef({source:kind||'GOOGLE_DRIVE',sourceId:DRIVE_ID.test(sourceId)?sourceId:undefined,sourceRef:ref,url:ref,observedAt})];
  const parsed=splitSheetRef(ref),sheet=parsed?.sheet||'';
  const actionRegisterAlias=kind==='DRIVE_ACTION'||kind==='DRIVE_CANONICAL_SCIENCE_ARTIFACT'||ACTION_REGISTER_GIDS[sheet]!=null;
  if(actionRegisterAlias||sourceId===ACTION_REGISTER_ID){
    return[knownSpreadsheetRef(ACTION_REGISTER_ID,ref||'ACTIONS',kind||'ACTION_REGISTER_PROVENANCE',observedAt)];
  }
  if(sourceId===TOWER_ID||TOWER_SHEET_GIDS[sheet]!=null){
    return[knownSpreadsheetRef(TOWER_ID,ref||'',kind||'PEER_CONTROL_TOWER_FROZEN',observedAt)];
  }
  if(DRIVE_ID.test(sourceId)&&/(GOOGLE|DRIVE|SHEET)/.test(kind)){
    const url=/SHEET/.test(kind)?`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sourceId)}/edit`:driveUrl(sourceId);
    return[docRef({source:kind||'GOOGLE_DRIVE',sourceId,sourceRef:ref||sourceId,url,observedAt})];
  }
  return[];
}

const LEARNING_TAB_BY_SOURCE=Object.freeze({
  'ACTION_REGISTER.CANDIDATES':'CANDIDATES',
  'ACTION_REGISTER.EXECUTION_RUNS':'EXECUTION_RUNS',
  'ACTION_REGISTER.RELATION_LEDGER':'RELATION_LEDGER',
  'ACTION_REGISTER.PROCEDURAL_MEMORY':'PROCEDURAL_MEMORY',
  'ACTION_REGISTER.ADAPTIVE_POLICY':'ADAPTIVE_POLICY',
  'ACTION_REGISTER.STRATEGY_REGISTRY':'STRATEGY_REGISTRY',
  'ACTION_REGISTER.SKILL_EVOLUTION':'SKILL_EVOLUTION',
});
export function learningSourceRefs(row={}){
  const kind=compact(row.source_kind).toUpperCase(),tab=LEARNING_TAB_BY_SOURCE[kind];
  if(!tab)return[];
  return[docRef({source:'ACTION_REGISTER_PROVENANCE',sourceId:ACTION_REGISTER_ID,sourceRef:`${tab}:${compact(row.source_id)||'source'}`,url:sheetUrl(ACTION_REGISTER_ID,ACTION_REGISTER_GIDS[tab]),observedAt:row.observed_at||row.created_at||row.updated_at||''})];
}
