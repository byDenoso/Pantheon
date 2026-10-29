import {createHash} from 'node:crypto';
import {ownerAccess} from '../owner.mjs';
import {readSession} from '../auth.mjs';
import {validateImportedDriveRevision} from '../drive-source.mjs';
import {createTrustedRetrievalAdapter} from './adapter.mjs';
import {POLICY} from './integrity.mjs';
import {classifyRetrievalFailure} from './errors.mjs';

export const RETRIEVAL_GATE = 'faithful-contextual-router-v13';
const hash = value => createHash('sha256').update(value).digest('hex');
const denied = () => {throw new Error('AUTHORIZATION_REQUIRED');};

/** Fresh primary owner and PIN-session checks, including PIN rotation. */
export async function retrievalAuthorization(request, env, now = Date.now()) {
  const access = await ownerAccess(request, env);
  if (!access.owner || access.setupRequired || !access.userId) denied();
  const session = await readSession(request, access.env, now);
  if (!session) denied();
  // readSession has already required exactly one well-formed cookie. Reuse its
  // identifier only as a private comparison key, never as a returned credential.
  const entries = (request.headers.get('cookie') || '').split(';').map(s => s.trim())
    .filter(s => s.startsWith('__Host-atlas_session='));
  if (entries.length !== 1) denied();
  const token = entries[0].slice('__Host-atlas_session='.length);
  if (!/^[a-f0-9]{64}$/.test(token)) denied();
  return Object.freeze({authorized:true, owner:true, pin_valid:true,
    subject:access.userId, session_id:hash(token),
    session_epoch:hash(access.env.NEXO_ATLAS_PIN_HASH),
    // This first browser route is least-privilege LEARNER. Neither body nor
    // headers nor a browser role selector can change the server policy.
    role:'LEARNER', policy:POLICY, now:new Date(now).toISOString()});
}

/** Same-origin private browser surface only. This is not an MCP identity bridge. */
export async function faithfulRetrievalRoute(request, env, body, binding, clock = Date.now) {
  if (env.NEXO_ATLAS_RETRIEVAL !== RETRIEVAL_GATE)
    return {status:503,body:{error:'RETRIEVAL_COMPONENT_DISABLED',available:false}};
  const search = createTrustedRetrievalAdapter({db:env.DB, enabled:true,
    authorize:() => retrievalAuthorization(request, env, clock()),
    checkSource:manifest => validateImportedDriveRevision(binding, manifest)});
  try {return {status:200,body:await search(body)};}
  catch (error) {return classifyRetrievalFailure(error);}
}
