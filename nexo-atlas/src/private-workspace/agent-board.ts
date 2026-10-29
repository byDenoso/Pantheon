// Read-only view of the canonical board file. Unrelated missing evolution fields
// must not suppress real posts; snapshots and inferred conversations are not sources.
import type {SystemState} from '../contracts/system.ts';
import {matchesSearch, type BoardRecord} from '../features/lab/presentation.ts';
export type AgentPost = BoardRecord & {sourceIndex: number; resolved_by?: string | null};
export type BoardStatus = 'open' | 'answered' | 'resolved' | 'expired' | 'note';
export type AgentBoard = {availability: 'available' | 'partial' | 'unavailable'; posts: AgentPost[]; sourceCount: number | null; invalidCount: number; sourcePath: 'evolution/board.json'; sourceRevision: string | null; observedAt: string | null};
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const text = (v: unknown): v is string => typeof v === 'string' && Boolean(v.trim());
export function agentBoard(state: SystemState): AgentBoard {
  const raw = state as unknown as {read_model?: {source_revision?: string; evolution?: Record<string, unknown>}; generated_at?: string};
  const revision = raw.read_model?.source_revision ?? null;
  const result: AgentBoard = {availability:'unavailable',posts:[],sourceCount:null,invalidCount:0,sourcePath:'evolution/board.json',sourceRevision:revision,observedAt:raw.generated_at ?? state.bus?.generated_at ?? null};
  if (!revision || revision !== state.bus?.fingerprint) return result;
  const file = raw.read_model?.evolution?.board;
  if (!record(file) || !Array.isArray(file.posts)) return result;
  result.sourceCount = file.posts.length;
  for (const [sourceIndex,row] of file.posts.entries()) {
    if (!record(row) || !['id','at','from','to','text'].every(key => text(row[key]))) {result.invalidCount++; continue;}
    // Keep source identity, wording, order/locator and declared fields; never render source HTML.
    result.posts.push({...row,sourceIndex,refs:Array.isArray(row.refs) ? row.refs.filter(text) : [],
      reply_to:text(row.reply_to) ? row.reply_to : text(row.in_reply_to) ? row.in_reply_to : null,
      resolved_at:text(row.resolved_at) ? row.resolved_at : null,
      expires_at:text(row.expires_at) ? row.expires_at : null,
    } as AgentPost);
  }
  result.availability = result.invalidCount ? 'partial' : 'available';
  return result;
}
export function postStatus(post: AgentPost, posts: readonly AgentPost[], observedAt: string | null): BoardStatus {
  if (post.resolved_at) return 'resolved';
  const at = Date.parse(observedAt ?? '');
  if (post.expires_at && Number.isFinite(at) && Date.parse(post.expires_at) <= at) return 'expired';
  if (post.from === post.to && post.to !== 'ALL') return 'note';
  // Only a source-linked reply from the addressed role constitutes an answer.
  if (post.to !== 'ALL' && post.to !== post.from && posts.some(reply => reply.id !== post.id && reply.reply_to === post.id && reply.from === post.to && (reply.to === post.from || reply.to === 'ALL') && Date.parse(reply.at) >= Date.parse(post.at) && Date.parse(reply.at) <= at)) return 'answered';
  return 'open';
}
export function filterBoard(board: AgentBoard, {query='',role='',status='all'}: {query?: string; role?: string; status?: BoardStatus | 'all'} = {}): AgentPost[] {
  return board.posts.filter(post => (!role || post.from === role || post.to === role)
    && (status === 'all' || postStatus(post,board.posts,board.observedAt) === status)
    && matchesSearch(query,post.id,post.from,post.to,post.text,post.reply_to,...post.refs ?? []))
    .sort((a,b) => (Number.isFinite(Date.parse(b.at)) ? Date.parse(b.at) : -Infinity) - (Number.isFinite(Date.parse(a.at)) ? Date.parse(a.at) : -Infinity) || a.id.localeCompare(b.id) || a.sourceIndex-b.sourceIndex);
}
