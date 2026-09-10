import {json,requireEnv} from './http.mjs';
import {googleToken} from './google.mjs';

const DEFAULT_ACTION_REGISTER_ID='1twRpSoZCOXv77YyCh_5V9nAS2PM2nqzex2A37eI2Zas';

function rows(data){
  if(!Array.isArray(data?.values)||!Array.isArray(data.values[0]))return [];
  const headers=data.values[0].map(x=>String(x??'').trim());
  return data.values.slice(1)
    .filter(row=>Array.isArray(row)&&row.some(value=>String(value??'').trim()))
    .map(row=>Object.fromEntries(headers.map((name,index)=>[name,String(row[index]??'').trim()])));
}

async function sheet(token,id,range,signal){
  return json(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,{token,signal});
}

export async function readSystemInput({env=process.env,signal}={}){
  requireEnv(env,'NEXO_SHEET_ID');
  const actionId=env.NEXO_ACTION_REGISTER_ID||DEFAULT_ACTION_REGISTER_ID;
  const token=await googleToken(env,signal);
  const ranges={
    actions:'ACTIONS!A1:V1000',
    executionRuns:'EXECUTION_RUNS!A1:BB1000',
    sideQuests:'SIDE_QUESTS!A1:R1000',
    capabilities:'CAPABILITY_MATRIX!A1:N500',
    semanticMemory:'SEMANTIC_MEMORY!A1:R1000',
    proceduralMemory:'PROCEDURAL_MEMORY!A1:O1000',
    learningFilaments:'LEARNING_FILAMENTS!A1:R1000',
    automationHealth:'AUTOMATION_HEALTH!A1:T200',
  };
  const entries=await Promise.all(Object.entries(ranges).map(async([key,range])=>[key,rows(await sheet(token,actionId,range,signal))]));
  return Object.fromEntries(entries);
}
