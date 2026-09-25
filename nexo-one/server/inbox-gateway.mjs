// NEXO inbox gateway: a connector-free write path for ChatGPT tasks, and the robot's window on the inbox.
//
//  drop  GET /api/inbox-drop?id=<run-id>&i=<part>&n=<parts>&d=<base64url chunk of the JSON envelope>
//        The GPT only OPENS this URL. Parts wait in byDenoso/TCC@nexo-inbox inbox/_parts/<id>/; when all n
//        arrived the envelope is assembled, validated and written to inbox/ (read back before answering).
//  list  GET /api/inbox-list        -> every proposal in inbox/*.json         (robot only)
//  ack   GET /api/inbox-ack?ids=a,b -> moves those files to processed/        (robot only)
//        "Robot only" = a GitHub Actions OIDC token from byDenoso/Pantheon's NEXO Writer robot workflow,
//        verified against GitHub's public keys: the robot holds no GitHub secret at all.
// The GitHub credential lives only here (Vercel env NEXO_INBOX_TOKEN, Contents RW on byDenoso/TCC).
// Gate actions (APPROVE_CHARTER, CANONIZE, ...) are refused: they are born only in a conversation with Dener.
import { createHash, createPublicKey, createVerify } from 'node:crypto';
import { googleToken } from './adapters/google.mjs';
import { GOOGLE_WRITE_SCOPES } from './adapters/connect.mjs';

const REPO = 'byDenoso/TCC', BRANCH = 'nexo-inbox', API = 'https://api.github.com';
const GATE = new Set(['APPROVE_CHARTER', 'REJECT_CHARTER', 'CANONIZE', 'REJECT_CANARY']);
const MAX_PARTS = 40, MAX_CHUNK = 6000;
const ROBOT_REPO = 'byDenoso/Pantheon', ROBOT_WORKFLOW = '.github/workflows/nexo-writer-robot.yml', AUDIENCE = 'nexo-inbox';

const b64urlDecode = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

const SPOOL_ID_DEFAULT='1M2maKkuEjxumZRa145dzei7dEPFi2yKsKlUf7_scC-E';
const SHEETS_API='https://sheets.googleapis.com/v4/spreadsheets';
const SPOOL_SCAN='A:K';
const googleConfigured=env=>Boolean(env.GOOGLE_CONNECTOR||(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.GOOGLE_REFRESH_TOKEN));
const quoteSheet=title=>`'${String(title).replaceAll("'","''")}'`;
const ackStable=id=>`gwack-${createHash('sha256').update(String(id)).digest('hex').slice(0,32)}`;

async function sheetJson(token,url,options={}) {
  const response=await fetch(url,{
    ...options,
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...(options.headers||{})},
  });
  if(!response.ok){
    const detail=await response.json().catch(()=>({}));
    throw new Error(`SHEETS_${response.status}: ${String(detail?.error?.message||detail?.message||'request failed').slice(0,100)}`);
  }
  if(response.status===204)return {};
  return response.json();
}

async function readSpool(env) {
  const token=await googleToken(env,undefined,{scopes:GOOGLE_WRITE_SCOPES.sheets});
  const spreadsheetId=String(env.NEXO_SPOOL_ID||SPOOL_ID_DEFAULT).trim();
  const meta=await sheetJson(token,`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(title,index)`);
  const first=[...(meta.sheets||[])].sort((a,b)=>(a.properties?.index||0)-(b.properties?.index||0))[0];
  const title=String(first?.properties?.title||'').trim();
  if(!title)throw new Error('SHEETS_SPOOL_TAB_MISSING');
  const range=`${quoteSheet(title)}!${SPOOL_SCAN}`;
  const data=await sheetJson(token,`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`);
  const rows=Array.isArray(data.values)?data.values:[];
  const headerIndex=rows.findIndex(row=>Array.isArray(row)&&row.includes('stable_id')&&row.includes('envelope_b64url'));
  if(headerIndex<0)throw new Error('SHEETS_SPOOL_HEADER_MISSING');
  const header=rows[headerIndex];
  const columns={
    stable:header.indexOf('stable_id'),
    created:header.indexOf('created_at'),
    role:header.indexOf('role'),
    envelope:header.indexOf('envelope_b64url'),
  };
  const partBase=Math.max(header.length,columns.stable+1,columns.created+1,columns.role+1,columns.envelope+1);
  return {token,spreadsheetId,title,rows,headerIndex,columns,partBase};
}

async function appendSpoolRow(spool,row) {
  const range=`${quoteSheet(spool.title)}!${SPOOL_SCAN}`;
  return sheetJson(spool.token,`${SHEETS_API}/${encodeURIComponent(spool.spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[row]}),
  });
}

async function clearSpoolRows(spool,rowNumbers) {
  const unique=[...new Set(rowNumbers.filter(n=>Number.isInteger(n)&&n>0))];
  if(!unique.length)return;
  const ranges=unique.map(n=>`${quoteSheet(spool.title)}!A${n}:K${n}`);
  await sheetJson(spool.token,`${SHEETS_API}/${encodeURIComponent(spool.spreadsheetId)}/values:batchClear`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ranges}),
  });
}

function fullSpoolRow(spool,{stableId,envelope,role='ATLAS_GATEWAY'}) {
  const width=Math.max(spool.partBase,spool.columns.envelope+1);
  const row=Array(width).fill('');
  row[spool.columns.stable]=stableId;
  if(spool.columns.created>=0)row[spool.columns.created]=new Date().toISOString();
  if(spool.columns.role>=0)row[spool.columns.role]=String(role||'ATLAS_GATEWAY').slice(0,80);
  row[spool.columns.envelope]=Buffer.from(JSON.stringify(envelope),'utf8').toString('base64url');
  return row;
}

function spoolHasStable(spool,stableId) {
  return spool.rows.some(row=>String(row?.[spool.columns.stable]||'').trim()===stableId
    && String(row?.[spool.columns.envelope]||'').trim());
}

async function sheetInboxDrop(url,env) {
  const id=String(url.searchParams.get('id')||'').toLowerCase();
  const i=Number(url.searchParams.get('i')||1),n=Number(url.searchParams.get('n')||1);
  const chunk=String(url.searchParams.get('d')||'');
  if(!/^[a-z0-9-]{4,60}$/.test(id)||!(n>=1&&n<=MAX_PARTS)||!(i>=1&&i<=n)
      ||!chunk||chunk.length>MAX_CHUNK||!/^[A-Za-z0-9_-]+=*$/.test(chunk)) {
    return [{ok:false,error:'BAD_REQUEST',expected:'id=[a-z0-9-], i<=n<=40, d=base64url(<=6000)'},400];
  }

  let spool=await readSpool(env);
  if(spoolHasStable(spool,id))return [{ok:true,id,complete:true,saved:`sheet:${id}`,readback:'PASS',reused:true},200];

  const p=spool.partBase;
  const samePart=spool.rows.some(row=>row?.[p]==='GW_PART'&&row?.[p+1]===id&&Number(row?.[p+2])===i&&Number(row?.[p+3])===n&&row?.[p+4]===chunk);
  if(!samePart){
    const row=Array(p+5).fill('');
    row[p]='GW_PART';row[p+1]=id;row[p+2]=String(i);row[p+3]=String(n);row[p+4]=chunk;
    await appendSpoolRow(spool,row);
  }

  spool=await readSpool(env);
  const parts=new Map();
  const partRows=[];
  for(let index=0;index<spool.rows.length;index+=1){
    const row=spool.rows[index];
    if(row?.[spool.partBase]!=='GW_PART'||row?.[spool.partBase+1]!==id||Number(row?.[spool.partBase+3])!==n)continue;
    const part=Number(row?.[spool.partBase+2]);
    if(part>=1&&part<=n&&!parts.has(part))parts.set(part,String(row?.[spool.partBase+4]||''));
    partRows.push(index+1);
  }
  if(parts.size<n)return [{ok:true,id,received:parts.size,of:n,complete:false,transport:'SHEET_SPOOL'},202];

  let envelope;
  try{
    const joined=Array.from({length:n},(_,index)=>parts.get(index+1)||'').join('');
    envelope=JSON.parse(b64urlDecode(joined));
  }catch{
    return [{ok:false,id,error:'INVALID_JSON_AFTER_ASSEMBLY'},422];
  }
  if(refusesGate(envelope))return [{ok:false,id,error:'GATE_ACTIONS_ONLY_IN_CONVERSATION'},403];

  const stored={...envelope,_via:'INBOX_GATEWAY_SHEET'};
  await appendSpoolRow(spool,fullSpoolRow(spool,{stableId:id,envelope:stored,role:envelope?.source||'ATLAS_GATEWAY'}));
  const check=await readSpool(env);
  if(!spoolHasStable(check,id))return [{ok:false,id,error:'READBACK_FAILED'},502];
  await clearSpoolRows(check,partRows).catch(()=>null);
  return [{ok:true,id,complete:true,saved:`sheet:${id}`,readback:'PASS',transport:'SHEET_SPOOL'},201];
}

async function appendGatewayAck(env,id) {
  const spool=await readSpool(env),stableId=ackStable(id);
  const exists=spool.rows.some(row=>String(row?.[spool.columns.stable]||'').trim()===stableId);
  if(exists)return true;
  const row=Array(Math.max(spool.partBase,spool.columns.envelope+1)).fill('');
  row[spool.columns.stable]=stableId;
  if(spool.columns.created>=0)row[spool.columns.created]=new Date().toISOString();
  if(spool.columns.role>=0)row[spool.columns.role]='GATEWAY_ACK';
  await appendSpoolRow(spool,row);
  const check=await readSpool(env);
  return check.rows.some(candidate=>String(candidate?.[check.columns.stable]||'').trim()===stableId);
}

async function gatewayAckSet(env) {
  if(!googleConfigured(env))return new Set();
  const spool=await readSpool(env);
  return new Set(spool.rows.map(row=>String(row?.[spool.columns.stable]||'').trim()).filter(value=>value.startsWith('gwack-')));
}


async function gh(token, method, path, body) {
  const response = await fetch(`${API}/repos/${REPO}/contents/${path}${method === 'GET' ? `?ref=${BRANCH}` : ''}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'nexo-inbox-gateway' },
    body: body ? JSON.stringify({ branch: BRANCH, ...body }) : undefined,
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(`GITHUB_${response.status} ${method} ${path.split('/')[0]}: ${String(detail.message || '').slice(0, 90)}`);
  }
  return response.json();
}

function refusesGate(envelope) {
  const items = envelope?.kind === 'BATCH' ? envelope?.payload?.items || [] : [envelope];
  return items.some(item => String(item?.kind || '').toUpperCase() === 'OPERATOR_INTENT'
    && GATE.has(String(item?.payload?.action || '').toUpperCase()));
}

const notConfigured = [{ ok: false, error: 'GATEWAY_NOT_CONFIGURED', hint: 'NEXO_INBOX_TOKEN ausente na Vercel.' }, 503];

async function githubInboxDrop(url, env) {
  const token = env.NEXO_INBOX_TOKEN;
  if (!token) return notConfigured;
  const id = String(url.searchParams.get('id') || '').toLowerCase();
  const i = Number(url.searchParams.get('i') || 1), n = Number(url.searchParams.get('n') || 1);
  const chunk = String(url.searchParams.get('d') || '');
  if (!/^[a-z0-9-]{4,60}$/.test(id) || !(n >= 1 && n <= MAX_PARTS) || !(i >= 1 && i <= n)
      || !chunk || chunk.length > MAX_CHUNK || !/^[A-Za-z0-9_-]+=*$/.test(chunk)) {
    return [{ ok: false, error: 'BAD_REQUEST', expected: 'id=[a-z0-9-], i<=n<=40, d=base64url(<=6000)' }, 400];
  }
  const pad = v => String(v).padStart(2, '0');
  const partPath = `inbox/_parts/${id}/${pad(i)}-of-${pad(n)}.b64`;
  if (!(await gh(token, 'GET', partPath))) {
    await gh(token, 'PUT', partPath, { message: `inbox gateway: ${id} part ${i}/${n}`, content: Buffer.from(chunk).toString('base64') });
  }
  const listing = (await gh(token, 'GET', `inbox/_parts/${id}`)) || [];
  const parts = listing.filter(f => f.name.endsWith(`-of-${pad(n)}.b64`)).sort((a, b) => a.name.localeCompare(b.name));
  if (parts.length < n) return [{ ok: true, id, received: parts.length, of: n, complete: false }, 202];

  const chunks = await Promise.all(parts.map(async f => Buffer.from((await gh(token, 'GET', f.path)).content, 'base64').toString('utf8')));
  let envelope;
  try { envelope = JSON.parse(b64urlDecode(chunks.join(''))); } catch { return [{ ok: false, id, error: 'INVALID_JSON_AFTER_ASSEMBLY' }, 422]; }
  if (refusesGate(envelope)) return [{ ok: false, id, error: 'GATE_ACTIONS_ONLY_IN_CONVERSATION' }, 403];
  const kind = String(envelope.kind || 'BATCH').toUpperCase().replace(/[^A-Z_]/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const target = `inbox/${stamp}-${kind}-gw-${id}.json`;
  await gh(token, 'PUT', target, { message: `inbox gateway: ${kind} ${id}`, content: Buffer.from(JSON.stringify({ ...envelope, _via: 'INBOX_GATEWAY' }, null, 1)).toString('base64') });
  if (!(await gh(token, 'GET', target))) return [{ ok: false, id, error: 'READBACK_FAILED' }, 502];
  await Promise.all(parts.map(f => gh(token, 'DELETE', f.path, { message: `inbox gateway: assembled ${id}`, sha: f.sha }).catch(() => null)));
  return [{ ok: true, id, complete: true, saved: target, readback: 'PASS' }, 201];
}


export async function inboxDrop(url,env) {
  let sheetError=null;
  if(googleConfigured(env)){
    try{return await sheetInboxDrop(url,env);}
    catch(error){sheetError=error;}
  }
  if(env.NEXO_INBOX_TOKEN){
    try{return await githubInboxDrop(url,env);}
    catch(error){
      const detail=String(error?.message||error).slice(0,120);
      return [{ok:false,error:'GATEWAY_WRITE_FAILED',primary:'SHEET_SPOOL',fallback:'GITHUB_CONTENTS',detail},502];
    }
  }
  return [{ok:false,error:'GATEWAY_NOT_CONFIGURED',hint:sheetError?'Google Sheets write failed and GitHub fallback is absent.':'Configure the ATLAS Google connector for Sheets write.'},503];
}

// ── GitHub Actions OIDC (robot identity, no shared secret) ──────────────────
let jwksCache = null;
async function githubKey(kid) {
  if (!jwksCache || jwksCache.until < Date.now()) {
    const jwks = await (await fetch('https://token.actions.githubusercontent.com/.well-known/jwks')).json();
    jwksCache = { keys: jwks.keys || [], until: Date.now() + 3600e3 };
  }
  const jwk = jwksCache.keys.find(k => k.kid === kid);
  return jwk ? createPublicKey({ key: jwk, format: 'jwk' }) : null;
}

async function isRobot(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return false;
  const header = JSON.parse(b64urlDecode(h)), claims = JSON.parse(b64urlDecode(p));
  const key = header.alg === 'RS256' ? await githubKey(header.kid) : null;
  if (!key) return false;
  const verified = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(key, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  return verified && claims.iss === 'https://token.actions.githubusercontent.com' && claims.aud === AUDIENCE
    && claims.exp > Date.now() / 1000 && claims.repository === ROBOT_REPO && String(claims.workflow_ref || '').includes(ROBOT_WORKFLOW);
}

export async function inboxRobot(route, url, req, env) {
  if (!(await isRobot(req).catch(() => false))) return [{ ok: false, error: 'ROBOT_ONLY' }, 403];
  const token = env.NEXO_INBOX_TOKEN;
  if (!token && route === 'inbox-list') return notConfigured;
  const files = token ? (((await gh(token, 'GET', 'inbox')) || []).filter(f => f.type === 'file' && f.name.endsWith('.json'))) : [];
  if (route === 'inbox-list') {
    let acked=new Set();
    try{acked=await gatewayAckSet(env);}catch{/* compatibility: a Sheets outage must not hide GitHub proposals */}
    const items = [];
    for (const f of files.sort((a, b) => a.name.localeCompare(b.name))) {
      const id=f.name.replace(/\.json$/, '');
      if(acked.has(ackStable(id)))continue;
      try {
        const blob = await gh(token, 'GET', f.path);
        const envelope = JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8').replace(/^﻿/, ''));
        if (envelope && typeof envelope === 'object' && !refusesGate(envelope)) items.push({ id, envelope });
      } catch { /* unreadable file stays in inbox/ */ }
    }
    return [{ ok: true, items }, 200];
  }

  const requested = new Set(String(url.searchParams.get('ids') || '').split(',').filter(Boolean));
  const targets=files.filter(f=>requested.has(f.name.replace(/\.json$/,'')));
  const acknowledged=[],moved=[],retained=[];
  for (const f of targets) {
    const id=f.name.replace(/\.json$/,'');
    let sheetAck=false;
    if(googleConfigured(env)){
      try{sheetAck=await appendGatewayAck(env,id);}catch{/* GitHub cleanup may still succeed */}
    }
    if(sheetAck)acknowledged.push(id);
    if(!token){if(sheetAck)retained.push(f.name);continue;}
    try{
      const blob = await gh(token, 'GET', f.path);
      await gh(token, 'PUT', `processed/${f.name}`, { message: `writer robot: processed ${f.name}`, content: blob.content.replace(/\s/g, '') });
      await gh(token, 'DELETE', f.path, { message: `writer robot: applied ${f.name}`, sha: blob.sha });
      moved.push(f.name);
    }catch{
      if(sheetAck)retained.push(f.name);
      else return [{ok:false,error:'ACK_PERSISTENCE_FAILED',id},502];
    }
  }
  return [{ ok: true, moved, acknowledged, retained, github_read_only: retained.length > 0 }, 200];
}
