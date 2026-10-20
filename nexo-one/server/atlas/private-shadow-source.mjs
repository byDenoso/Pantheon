// Independent read-only SHADOW projection for the authenticated Atlas route.
// No LIVE Tower dependency; no public route or browser-supplied upstream.
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
  for (const [name, fields] of Object.entries(FIELDS)) {
    if (!Array.isArray(board[name])) throw new Error('SHADOW_TAB_INVALID');
    result[name] = board[name].map(row => safeRow(row, fields)).filter(Boolean);
  }
  result.counts = Object.fromEntries(Object.keys(FIELDS).map(name => [name, result[name].length]));
  return result;
}

export async function readAtlasPrivateShadow(env = process.env, fetcher = fetch,
    {tokenProvider = googleToken, boardReader = readShadowBoard} = {}) {
  const token = await tokenProvider(env, AbortSignal.timeout(8000),
                                   {scopes: ['https://www.googleapis.com/auth/drive.readonly']});
  if (!token) throw new Error('SHADOW_READ_CREDENTIAL_REQUIRED');
  const board = await boardReader({token, fetchImpl: fetcher, signal: AbortSignal.timeout(20000)});
  return projectPrivateShadowBoard(board);
}
