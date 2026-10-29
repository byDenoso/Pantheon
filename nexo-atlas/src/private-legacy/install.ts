// MUST be the first import of the private entry: guards are in place before any legacy module evaluates.
import {installGuards} from './guards.ts';
import {runtimeHolder,postToParent,frameMessage} from './state.ts';
import {createTestRecordReader} from '../private-workspace/test-records.ts';
import {createMemoryTransport} from '../private-memory/transport.ts';
import {createMcpGrantTransport} from '../private-memory/mcpGrant.ts';
import {createRetrievalTransport, createRetrievalSyncTransport} from '../private-memory/retrieval.ts';
import {createKnowledgeTransport} from '../private-memory/knowledge.ts';
import {createContinuityTransport} from '../private-workspace/continuity.ts';
// Capture only fixed owner-authenticated memory and explicit MCP grant APIs
// before legacy network containment. Never expose a generic native fetch.
const nativeFetch = window.fetch.bind(window);
export const testRecordReader = createTestRecordReader(nativeFetch,runtimeHolder,()=>postToParent(frameMessage.logout()));
export const retrievalTransport = createRetrievalTransport(nativeFetch);
export const retrievalSyncTransport = createRetrievalSyncTransport(nativeFetch);
export const memoryTransport = createMemoryTransport(nativeFetch);
export const knowledgeTransport = createKnowledgeTransport(nativeFetch);
export const continuityTransport = createContinuityTransport(nativeFetch);
export const mcpGrantTransport = createMcpGrantTransport(nativeFetch);
export const guards = installGuards(window, runtimeHolder);
