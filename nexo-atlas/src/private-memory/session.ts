import {createNexoWebMCP, type WebMCPEnvironment} from './webmcp.ts';
import type {KnowledgeRead} from './knowledge.ts';

/** Bind installed read tools to one verified private runtime generation. */
export async function startPrivateKnowledgeSession({read,environment,revision,getRevision,signal,onUnauthorized}: {
  read: KnowledgeRead; environment: WebMCPEnvironment; revision: string;
  getRevision: () => string | null; signal: AbortSignal; onUnauthorized: () => void;
}) {
  const lifetime = new AbortController();
  const combined = AbortSignal.any([signal,lifetime.signal]);
  const authorized = () => !combined.aborted && /^sha256:[a-f0-9]{64}$/.test(revision) && getRevision() === revision;
  const scopedRead: KnowledgeRead = async (action,body,requestSignal) => {
    if (!authorized()) throw new Error('AUTH_REQUIRED');
    if (body.expected_revision !== undefined && body.expected_revision !== revision) throw new Error('KNOWLEDGE_REVISION_CONFLICT');
    try {
      const result = await read(action,{...body,expected_revision:revision},requestSignal);
      if (!authorized()) throw new Error('AUTH_REQUIRED');
      return result;
    } catch (error) {
      if ((error as {status?:number})?.status === 401) {lifetime.abort();onUnauthorized();}
      throw error;
    }
  };
  return createNexoWebMCP({read:scopedRead,isAuthorized:authorized,environment,enabled:true,signal:combined});
}
