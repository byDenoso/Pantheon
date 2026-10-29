import {classifySourceFailure} from '../source-errors.mjs';

const invalid=new Set(['INVALID_RETRIEVAL_REQUEST','UNSUPPORTED_RETRIEVAL_OPTIONS',
  'HISTORICAL_QUERY_UNSUPPORTED','GRAPH_ENTITY_REQUIRED','GRAPH_QUERY_REQUIRES_AT_MOST_TWO_ENTITIES',
  'INVALID_ENTITY','GRAPH_TRAVERSAL_BOUNDS','INVALID_GRAPH_OPTIONS','INVALID_QUERY','INVALID_TOP_K',
  'UNSUPPORTED_RETRIEVAL_MODE','QUERY_RESOURCE_BOUND']);
const auth=new Set(['AUTHORIZATION_REQUIRED','AUTHORIZATION_CHANGED_DURING_QUERY']);
const stale=new Set(['VIEW_VALIDITY_EXPIRED','IMPORTED_GENERATION_STALE','GENERATION_CHANGED_DURING_QUERY']);
const safeCodes=new Set([...invalid,...auth,...stale,'RETRIEVAL_COMPONENT_DISABLED',
  'AUTHORIZED_INDEX_UNAVAILABLE','ENTITY_NOT_FOUND_OR_NOT_AUTHORIZED','OFFLINE_FIXTURE_ONLY','HISTORICAL_VIEW_UNSUPPORTED',
  'ROLE_BINDING_INVALID','IMPORTED_TRANSPORT_BINDING_MISSING','CONNECTOR_LIST_FILE_REVISIONS_FAILED',
  'GENERATION_NOT_VERIFIED','MANIFEST_HASH_INVALID','SHARD_CONTENT_HASH_INVALID',
  'SHARD_HASH_BINDING_INVALID','IMPLEMENTATION_BINDING_INVALID','SOURCE_BINDING_INVALID']);

// Browser retrieval and MCP preserve the same bounded, credential-free cause.
// Unavailable indexes and connector failures are never invalid caller arguments.
export function classifyRetrievalFailure(error){
  const source=classifySourceFailure(error);
  const candidate=error?.message;
  const diagnostic=safeCodes.has(candidate)?candidate:
    source.diagnostic==='PRIVATE_SOURCE_UNEXPECTED'?'RETRIEVAL_UNAVAILABLE':source.diagnostic;
  const status=auth.has(diagnostic)?401:invalid.has(diagnostic)?400:stale.has(diagnostic)?409:503;
  const errorCode=invalid.has(diagnostic)?'INVALID_ARGUMENT':auth.has(diagnostic)?'AUTHORIZATION_REQUIRED':
    stale.has(diagnostic)?'STALE_INDEX':source.connectorStatus==='reauthentication_required'?'SOURCE_REAUTHENTICATION_REQUIRED':
    source.connectorStatus==='rate_limited'?'RATE_LIMITED':diagnostic==='AUTHORIZED_INDEX_UNAVAILABLE'?'INDEX_UNAVAILABLE':'SOURCE_UNAVAILABLE';
  const sourceFailure=source.diagnostic!=='PRIVATE_SOURCE_UNEXPECTED'||!!source.connectorStatus;
  return {status,body:{error:diagnostic,error_code:errorCode,diagnostic,available:false,
    ...(source.connectorStatus?{connectorStatus:source.connectorStatus}:{}),
    ...(sourceFailure&&status===503?{recovery:source.recovery,...(source.retryAfter?{retryAfter:source.retryAfter}:{})}:{})}};
}
