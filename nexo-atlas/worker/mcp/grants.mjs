import {createHash, randomUUID} from 'node:crypto';
import {database, sameOrigin, configured} from '../auth.mjs';
import {ownerAccess} from '../owner.mjs';
import {retrievalAuthorization} from '../retrieval/route.mjs';
import {POLICY} from '../retrieval/integrity.mjs';

export const MCP_GATE = 'owner-pin-current-mcp-v13';
export const GRANT_APPROVAL_GATE = 'owner-pin-readonly-30d-v1';
export const GRANT_SCOPE = 'tower-scientific-current-readonly-v13';
export const MAX_GRANT_MS = 30 * 24 * 60 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest('hex');
export function denyGrant(code = 'MCP_GRANT_REQUIRED', status = 403) {
  const error = new Error(code); error.httpStatus = status; throw error;
}

/** Trusted Sites owner identity + fresh primary grant/current PIN on every read.
 * No cookies, bearer tokens, caller role, service identity or cached auth accepted.
 */
export async function mcpAuthorization(request, env, now = Date.now()) {
  const access = await ownerAccess(request, env);
  if (!access.signedIn) denyGrant('MCP_IDENTITY_REQUIRED',401);
  if (!access.owner || access.setupRequired || !access.userId) denyGrant('MCP_OWNER_REQUIRED');
  const grant = await database(env).prepare(`SELECT g.*, o.pin_hash AS current_pin_hash FROM atlas_mcp_grants g
    JOIN atlas_owner o ON o.id=1 AND o.user_id=g.user_id WHERE g.user_id = ?`)
    .bind(access.userId).first();
  if (!grant || typeof grant.grant_id !== 'string' || !grant.grant_id || grant.revoked_at !== null ||
      !configured({...env,NEXO_ATLAS_PIN_HASH:grant.current_pin_hash}) ||
      grant.credential_sha256 !== hash(grant.current_pin_hash) ||
      grant.role !== 'LEARNER' || grant.policy !== POLICY || grant.scope !== GRANT_SCOPE ||
      !Number.isSafeInteger(grant.created_at) || !Number.isSafeInteger(grant.expires_at) ||
      grant.created_at > now || grant.expires_at <= now || grant.expires_at <= grant.created_at ||
      grant.expires_at > grant.created_at + MAX_GRANT_MS) denyGrant();
  return Object.freeze({authorized:true,owner:true,pin_valid:true,subject:access.userId,
    session_id:grant.grant_id,session_epoch:grant.credential_sha256,
    role:'LEARNER',policy:POLICY,now:new Date(now).toISOString()});
}

/** Browser-only lifecycle. Grant approval gate stays absent pending permission.
 * An MCP request cannot create/renew/revoke a grant. No grant is minted at login.
 */
export async function mcpGrantRoute(request, env, body = {}, clock = Date.now) {
  if (!['GET','POST','DELETE'].includes(request.method)) return {status:405,body:{error:'METHOD_NOT_ALLOWED'}};
  if (request.method!=='GET'&&!sameOrigin(request)) return {status:403,body:{error:'ORIGIN_NOT_ALLOWED'}};
  const now=clock(), browser=await retrievalAuthorization(request,env,now), db=database(env);
  if (request.method==='GET') {
    let active=false,expiresAt=null;
    try {const auth=await mcpAuthorization(request,env,clock());active=true;
      const row=await db.prepare('SELECT expires_at FROM atlas_mcp_grants WHERE user_id = ? AND grant_id = ?').bind(auth.subject,auth.session_id).first();
      expiresAt=row?new Date(row.expires_at).toISOString():null;
      // The status read is not an authorization cache.
      await mcpAuthorization(request,env,clock());
    } catch(error) {if(!error.httpStatus)throw error;active=false;expiresAt=null;}
    await retrievalAuthorization(request,env,clock());
    return {status:200,body:{active,expiresAt,role:'LEARNER',policy:POLICY,scope:GRANT_SCOPE,
      approvalEnabled:env.NEXO_ATLAS_MCP_GRANT_APPROVAL===GRANT_APPROVAL_GATE,maxDays:30}};
  }
  if (request.method==='DELETE') {
    await db.prepare('UPDATE atlas_mcp_grants SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(now,browser.subject).run();
    return {status:200,body:{active:false}};
  }
  if (env.NEXO_ATLAS_MCP_GRANT_APPROVAL!==GRANT_APPROVAL_GATE)
    return {status:403,body:{error:'MCP_GRANT_APPROVAL_REQUIRED'}};
  if (!body || Object.keys(body).sort().join(',')!=='confirm,days' || body.confirm!==GRANT_APPROVAL_GATE ||
      !Number.isInteger(body.days) || body.days<1 || body.days>30)
    return {status:400,body:{error:'INVALID_MCP_GRANT_REQUEST'}};
  const access=await ownerAccess(request,env), id=randomUUID(), expiresAt=now+body.days*86400000;
  if (!access.owner || access.userId!==browser.subject || hash(access.env.NEXO_ATLAS_PIN_HASH)!==browser.session_epoch)
    denyGrant('AUTHORIZATION_CHANGED_DURING_QUERY');
  // Bind the write atomically to the same live browser session/current owner PIN.
  const row=await db.prepare(`INSERT INTO atlas_mcp_grants
    (user_id,grant_id,credential_sha256,role,policy,scope,created_at,expires_at,revoked_at)
    SELECT ?,?,?, 'LEARNER',?,?,?, ?,NULL FROM atlas_owner
    WHERE id=1 AND user_id=? AND pin_hash=? AND EXISTS
      (SELECT 1 FROM atlas_sessions WHERE token_hash=? AND credential=? AND expires_at>? AND expires_at<=?)
    ON CONFLICT(user_id) DO UPDATE SET grant_id=excluded.grant_id,
      credential_sha256=excluded.credential_sha256,role=excluded.role,policy=excluded.policy,
      scope=excluded.scope,created_at=excluded.created_at,expires_at=excluded.expires_at,revoked_at=NULL
    RETURNING grant_id`).bind(browser.subject,id,browser.session_epoch,POLICY,GRANT_SCOPE,now,expiresAt,
      browser.subject,access.env.NEXO_ATLAS_PIN_HASH,browser.session_id,browser.session_epoch,now,now+3600000).first();
  if(row?.grant_id!==id)denyGrant('AUTHORIZATION_CHANGED_DURING_QUERY');
  try {
    const after=await retrievalAuthorization(request,env,clock());
    if(after.subject!==browser.subject||after.session_id!==browser.session_id||after.session_epoch!==browser.session_epoch)
      denyGrant('AUTHORIZATION_CHANGED_DURING_QUERY');
    await mcpAuthorization(request,env,clock());
  } catch(error) {
    await db.prepare('UPDATE atlas_mcp_grants SET revoked_at=? WHERE user_id=? AND grant_id=?').bind(clock(),browser.subject,id).run();
    throw error;
  }
  return {status:201,body:{active:true,expiresAt:new Date(expiresAt).toISOString(),
    role:'LEARNER',policy:POLICY,scope:GRANT_SCOPE}};
}
