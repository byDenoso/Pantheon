// Independent read-only SHADOW projection for the authenticated Atlas route.
// No LIVE Tower dependency; no public route or browser-supplied upstream.
import {createHash, sign} from 'node:crypto';
import {googleToken} from '../adapters/google.mjs';
import {readShadowBoard, SHADOW_ID} from './shadow-board.mjs';

const FIELDS = Object.freeze({
  roadmap: ['item','titulo','status','dono','prio','proximo_teste','depende_de','atualizado','nota'],
  mural: ['data','de','para','texto','link','tipo','item','id'],
  resumo: ['data_hora','nivel','item','o_que_mudou','impacto','link'],
  resultados: ['data','task','item','titulo','resultado','numeros','limites','link_dados'],
  equipe: ['papel','task_id','cadencia','frentes','estado'],
});

// Conservative denial for the two specifically excluded private programs.
const RESTRICTED = /(?:peer|olympus)/i;
const PRIVATE_TOKEN = /(?:sk-proj-|gh[pousr]_|AIza[\w-]{30,}|(?:access[_-]?token|authorization|api[_-]?key)\s*[:=])/i;
function safeRow(row, fields) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const output = {};
  for (const field of fields) {
    const value = row[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') return null;
    if (RESTRICTED.test(value.normalize('NFKC')) || PRIVATE_TOKEN.test(value)) return null;
    output[field] = value;
  }
  return output;
}

export function projectPrivateShadowBoard(board) {
  if (!board || board.contract !== 'NEXO_SHADOW_BOARD_V1' || board.access !== 'PRIVATE' ||
      board.unavailable || board.source_id !== SHADOW_ID) throw new Error('SHADOW_CANONICAL_UNAVAILABLE');
  const result = {
    contract: 'NEXO_SHADOW_BOARD_V1', access: 'PRIVATE',
    authority: 'SHADOW', projection_only: true, writeback: 'FORBIDDEN',
    source_id: board.source_id, modified_at: board.modified_at ?? null,
  };
  result.availability = Object.fromEntries(Object.keys(FIELDS).map(name => {
    const value=board.availability?.[name];
    return [name, value==='available'||value==='unavailable' ? value : 'unknown'];
  }));
  for (const [name, fields] of Object.entries(FIELDS)) {
    if (!Array.isArray(board[name])) throw new Error('SHADOW_TAB_INVALID');
    result[name] = result.availability[name]==='available' ? board[name].map(row => safeRow(row, fields)).filter(Boolean) : [];
  }
  result.counts = Object.fromEntries(Object.keys(FIELDS).map(name => [name, result[name].length]));
  return result;
}

const DRIVE_READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const encodeJwtPart = value => Buffer.from(JSON.stringify(value)).toString('base64url');

// Short-lived bearer tokens stay within the worker, scoped to this key and reader.
let cachedServiceToken;
async function shadowServiceAccountToken(raw, fetcher, signal) {
  const fingerprint = createHash('sha256').update(raw).digest('hex');
  const started = Date.now();
  if (cachedServiceToken?.fingerprint === fingerprint && cachedServiceToken.fetcher === fetcher &&
      cachedServiceToken.until > started) return cachedServiceToken.token;
  let assertion;
  try {
    const key = JSON.parse(raw);
    if (key.type !== 'service_account' || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(key.client_email ?? '') ||
        typeof key.private_key !== 'string' || typeof key.private_key_id !== 'string' || !key.private_key_id) {
      throw new Error('INVALID_KEY');
    }
    const iat = Math.floor(Date.now() / 1000);
    const header = encodeJwtPart({alg:'RS256', typ:'JWT', kid:key.private_key_id});
    const claims = encodeJwtPart({iss:key.client_email, scope:DRIVE_READ_SCOPE, aud:GOOGLE_TOKEN_URL, iat, exp:iat + 3600});
    const unsigned = header + '.' + claims;
    assertion = unsigned + '.' + sign('RSA-SHA256', Buffer.from(unsigned), key.private_key).toString('base64url');
  } catch {
    throw new Error('SHADOW_SERVICE_ACCOUNT_INVALID');
  }
  try {
    const response = await fetcher(GOOGLE_TOKEN_URL, {
      method:'POST', redirect:'error', signal,
      body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion}),
    });
    if (!response.ok) throw new Error('TOKEN_EXCHANGE_FAILED');
    const data = await response.json();
    if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('INVALID_TOKEN_RESPONSE');
    const usableSeconds = Math.min(Number(data.expires_in), 3600) - 120;
    if (usableSeconds > 0) cachedServiceToken = {fingerprint, fetcher, token:data.access_token, until:started + usableSeconds * 1000};
    return data.access_token;
  } catch {
    throw new Error('SHADOW_SERVICE_ACCOUNT_UNAVAILABLE');
  }
}

export async function readAtlasPrivateShadow(env = process.env, fetcher = fetch,
    {tokenProvider = googleToken, boardReader = readShadowBoard} = {}) {
  const signal = AbortSignal.timeout(8000);
  const serviceAccount = env.NEXO_ATLAS_SHADOW_SERVICE_ACCOUNT_JSON;
  const token = serviceAccount
    ? await shadowServiceAccountToken(serviceAccount, fetcher, signal)
    : await tokenProvider(env, signal, {scopes:[DRIVE_READ_SCOPE], reuseDriveRead:true});
  if (!token) throw new Error('SHADOW_READ_CREDENTIAL_REQUIRED');
  const board = await boardReader({
    token, fetchImpl: fetcher, signal: AbortSignal.timeout(20000),
    allowMissingDriveMetadata: Boolean(serviceAccount),
  });
  return projectPrivateShadowBoard(board);
}
