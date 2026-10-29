/** Private grant lifecycle only. Captured native fetch is never exported. */
export function createMcpGrantTransport(nativeFetch:typeof fetch) {
  return async(action:'status'|'create'|'revoke',signal?:AbortSignal):Promise<unknown>=>{
    if(!['status','create','revoke'].includes(action))throw new Error('MCP_GRANT_ACTION_DENIED');
    const response=await nativeFetch('/api/atlas-mcp/grant',{
      method:action==='status'?'GET':action==='create'?'POST':'DELETE',
      credentials:'same-origin',cache:'no-store',redirect:'error',signal,
      headers:{'Content-Type':'application/json'},
      ...(action==='create'?{body:JSON.stringify({confirm:'owner-pin-readonly-30d-v1',days:30})}:{}),
    });
    const value=await response.json();
    if(!response.ok)throw Object.assign(new Error(typeof value?.error==='string'?value.error:'MCP_GRANT_UNAVAILABLE'),{status:response.status});
    return value;
  };
}
export interface McpGrantStatus {active:boolean;expiresAt:string|null;approvalEnabled:boolean;role:'LEARNER';scope:'tower-scientific-current-readonly-v13'}
export function parseMcpGrantStatus(value:unknown):McpGrantStatus {
  if(!value||typeof value!=='object')throw new Error('MCP_GRANT_STATUS_INVALID');
  const v=value as Record<string,unknown>;
  if(typeof v.active!=='boolean'||typeof v.approvalEnabled!=='boolean'||v.role!=='LEARNER'||v.scope!=='tower-scientific-current-readonly-v13'||
     (v.active?(typeof v.expiresAt!=='string'||!Number.isFinite(Date.parse(v.expiresAt))):v.expiresAt!==null))throw new Error('MCP_GRANT_STATUS_INVALID');
  return v as unknown as McpGrantStatus;
}
