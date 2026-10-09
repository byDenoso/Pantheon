import {authenticated, sameOrigin} from '../auth/session.mjs';
import {atlasConfigured, atlasAuthenticated, atlasSameOrigin} from '../auth/atlas-session.mjs';
import {googleToken} from '../adapters/google.mjs';
import {googleRuntimeEnvironment} from '../adapters/connect.mjs';
import {readVerifiedCanonicalTower} from '../mcp/operational-state.mjs';
import {readSpool, appendSpoolRow, fullSpoolRow} from '../inbox-gateway.mjs';
import {SPOOL_ID} from '../mcp/operational-queue.mjs';
import {attestHuman, verifyHuman, humanProposal, sha256, canonical, verifyActionsIdentity,
  scientificPackage, WRITER_WORKFLOW, RUNNER_WORKFLOW} from './authority.mjs';

async function bodyOf(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > 32768) throw new Error('REQUEST_TOO_LARGE');
    return req.body;
  }
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw && req[Symbol.asyncIterator]) for await (const part of req) {
    raw += Buffer.from(part).toString('utf8'); if (Buffer.byteLength(raw) > 32768) throw new Error('REQUEST_TOO_LARGE');
  }
  if (Buffer.byteLength(raw) > 32768) throw new Error('REQUEST_TOO_LARGE');
  return JSON.parse(raw);
}
async function submitHuman(envelope, authorization, env, req) {
  const id = 'human-' + sha256(envelope).slice(0,48);
  const stored = {...envelope, _human_authorization: authorization};
  const read = async () => {
    const spool = await readSpool(env, req);
    if (spool.spreadsheetId !== SPOOL_ID) throw new Error('SPOOL_DESTINATION_MISMATCH');
    const rows = spool.rows.filter(row => row?.[spool.columns.stable] === id);
    for (const row of rows) {
      const actual = JSON.parse(Buffer.from(row[spool.columns.envelope], 'base64url').toString('utf8'));
      if (sha256(humanProposal(actual)) !== sha256(envelope)
          || !verifyHuman(actual, actual._human_authorization, env)) throw new Error('SPOOL_IDENTITY_CONFLICT');
    }
    return {spool, count:rows.length};
  };
  const before = await read();
  if (!before.count) await appendSpoolRow(before.spool, fullSpoolRow(before.spool,
    {stableId:id, envelope:stored, role:'AUTHENTICATED_HUMAN_CONTROL'}));
  if (!(await read()).count) throw new Error('SPOOL_BODY_READBACK_FAILED');
  return {stable_id:id, stage:'DELIVERED', readback:'PASS', reused:before.count > 0, proposal_sha256:sha256(envelope)};
}
const existingHumanSession = async (req,env) => atlasConfigured(env) ? atlasAuthenticated(req,env) : authenticated(req,env);
const existingHumanOrigin = (req,env) => atlasConfigured(env) ? atlasSameOrigin(req,env) : sameOrigin(req);
export function createAutonomyRoutes({humanAuthenticated=existingHumanSession, originAllowed=existingHumanOrigin,
  verifyIdentity=verifyActionsIdentity, submit=submitHuman,
  readTower=async (env,req) => readVerifiedCanonicalTower({
    token:await googleToken(googleRuntimeEnvironment(env,req.headers), undefined, {scopes:['https://www.googleapis.com/auth/drive.readonly']})})}={}) {
  return async (route, req, env=process.env) => {
    const reply=(status,body)=>({status,body});
    try {
      if (route === 'autonomy-control') {
        if (req.method !== 'POST') return reply(405,{error:'METHOD_NOT_ALLOWED'});
        if (!await humanAuthenticated(req,env)) return reply(401,{error:'HUMAN_SESSION_REQUIRED'});
        if (!originAllowed(req,env)) return reply(403,{error:'ORIGIN_NOT_ALLOWED'});
        const body=await bodyOf(req), proposal=humanProposal(body.envelope);
        const hash=sha256(proposal);
        if (body.confirmation_sha256 !== hash) return reply(409,{error:'EXACT_PROPOSAL_CONFIRMATION_REQUIRED',proposal_sha256:hash});
        const proof=attestHuman(proposal,env);
        return reply(202,await submit(proposal,proof,env,req));
      }
      if (route === 'autonomy-verify-human') {
        if (req.method !== 'POST') return reply(405,{error:'METHOD_NOT_ALLOWED'});
        if (!await verifyIdentity(req,{workflow:WRITER_WORKFLOW,audience:'nexo-autonomy-writer'})) return reply(403,{error:'WRITER_IDENTITY_REQUIRED'});
        const body=await bodyOf(req);
        if (!verifyHuman(body.envelope,body.authorization,env)) return reply(403,{error:'HUMAN_AUTHORIZATION_INVALID'});
        return reply(200,{verified:true,proposal_sha256:sha256(humanProposal(body.envelope))});
      }
      if (route === 'autonomy-scientific-package') {
        if (req.method !== 'GET') return reply(405,{error:'METHOD_NOT_ALLOWED'});
        const identity=await verifyIdentity(req,{workflow:RUNNER_WORKFLOW,audience:'nexo-autonomy-runner'});
        if (!identity) return reply(403,{error:'RUNNER_IDENTITY_REQUIRED'});
        const id=new URL(req.url,'https://local').searchParams.get('battery_id');
        if (!/^[a-z0-9-]{3,48}$/.test(id || '')) return reply(400,{error:'BATTERY_ID_INVALID'});
        const {tower}=await readTower(env,req);
        return reply(200,scientificPackage(tower,id,identity));
      }
      return reply(404,{error:'NOT_FOUND'});
    } catch (error) {
      const message=String(error?.message || '');
      const code=/^[A-Z][A-Z_0-9]{2,79}$/.test(message)?message:'AUTONOMY_UNAVAILABLE';
      return reply(code==='SCIENTIFIC_RUN_BINDING_PENDING'?425:code==='AUTONOMY_NOT_ACTIVE'?409:503,{error:code});
    }
  };
}
export default createAutonomyRoutes();
