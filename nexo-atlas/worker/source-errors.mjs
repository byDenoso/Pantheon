// Only transport state and reviewed diagnostic codes leave the source adapter.
// Never return connector messages, URLs, payload fragments or credentials.
const STATUSES=new Set(['invalid_request','request_context_expired','reauthentication_required',
 'connector_access_disabled','tool_not_found','tool_not_allowed','rate_limited',
 'tool_error','upstream_error','internal_error','binding_unavailable']);
const ACCESS_FAILURES=new Set(['connector_access_disabled','tool_not_found','tool_not_allowed','binding_unavailable']);
const DIAGNOSTICS=new Set(['PRIVATE_SOURCE_NOT_CONFIGURED','PRIVATE_SOURCE_UNAVAILABLE','TOWER_READ_RACE',
 'PRIVATE_RESPONSE_TOO_LARGE','CANONICAL_TOWER_INVALID','PRIVATE_TOWER_INVALID','PRIVATE_RUNTIME_INVALID',
 'PRIVATE_TOWER_SYSTEM_INVALID','PRIVATE_TOWER_VIEWS_INVALID','IMPORTED_TRANSPORT_BINDING_MISSING','IMPORTED_GENERATION_STALE',
 'CONNECTOR_LIST_FILE_REVISIONS_FAILED','CONNECTOR_FETCH_FAILED','CONNECTOR_LIST_FILE_REVISIONS_PAYLOAD_INVALID',
 'CONNECTOR_FETCH_PAYLOAD_INVALID','DRIVE_LIST_FILE_REVISIONS_RPC_EXCEPTION','DRIVE_FETCH_RPC_EXCEPTION',
 'DRIVE_DOWNLOAD_FETCH_EXCEPTION','DRIVE_DOWNLOAD_BODY_EXCEPTION','DRIVE_REVISION_ID_INVALID','DRIVE_REVISION_ROW_INVALID',
 'DRIVE_DOWNLOAD_METADATA_INVALID','DRIVE_DOWNLOAD_URL_MISSING','DRIVE_DOWNLOAD_URL_REJECTED',
 'DRIVE_DOWNLOAD_SIZE_MISMATCH','DRIVE_DOWNLOAD_BODY_MISSING']);
export const safeConnectorStatus=value=>STATUSES.has(value)?value:undefined;
export const boundedRetryAfter=value=>Number.isSafeInteger(value)&&value>0&&value<=86400?value:undefined;
export function classifySourceFailure(error){
 const code=DIAGNOSTICS.has(error?.code)?error.code:error?.message;
 const diagnostic=DIAGNOSTICS.has(code)||/^DRIVE_DOWNLOAD_HTTP_[1-5][0-9]{2}$/.test(code||'')?code:'PRIVATE_SOURCE_UNEXPECTED';
 const connectorStatus=safeConnectorStatus(error?.connectorStatus);
 const recovery=connectorStatus==='reauthentication_required'?'REAUTHORIZE_CONNECTOR':ACCESS_FAILURES.has(connectorStatus)?'CHECK_CONNECTOR_ACCESS':'RETRY_SOURCE';
 const retryAfter=recovery==='RETRY_SOURCE'?boundedRetryAfter(error?.retryAfter):undefined;
 return {error:'PRIVATE_SOURCE_UNAVAILABLE',diagnostic,...(connectorStatus?{connectorStatus}:{}),recovery,
  ...(retryAfter?{retryAfter}:{})};
}
