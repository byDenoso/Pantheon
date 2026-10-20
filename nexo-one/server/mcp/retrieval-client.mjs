/** Private MCP client. A token is server-only and bound to one authenticated subject. */
export class RetrievalError extends Error { constructor(code){super(code);this.code=code;} }
const fail=code=>{throw new RetrievalError(code);};
export class RetrievalClient {
  constructor({endpoint,token,expectedSubject,fetchImpl=fetch,timeoutMs=30000}){
    if(!endpoint||!token||!expectedSubject)fail('CONNECTOR_NOT_CONFIGURED');
    let url;try{url=new URL(endpoint);}catch{fail('UNTRUSTED_RETRIEVAL_ENDPOINT');}
    if((url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))||url.username||url.password||url.search||url.hash)fail('UNTRUSTED_RETRIEVAL_ENDPOINT');
    Object.assign(this,{endpoint,token,expectedSubject,fetchImpl,timeoutMs,session:null,connected:false,protocol:'2025-11-25',counter:0});
  }
  async rpc(method,params={},notification=false){
    const message={jsonrpc:'2.0',method,params};if(!notification)message.id=++this.counter;
    const headers={'Authorization':`Bearer ${this.token}`,'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':this.protocol};
    if(this.session)headers['MCP-Session-Id']=this.session;
    let response;try{response=await this.fetchImpl(this.endpoint,{method:'POST',headers,body:JSON.stringify(message),redirect:'error',signal:AbortSignal.timeout(this.timeoutMs)});}
    catch{fail('CONNECTOR_UNAVAILABLE');}
    if(response.status===401)fail('AUTHENTICATION_REQUIRED');
    if([403,404].includes(response.status))fail('SESSION_OR_SCOPE_UNAVAILABLE');
    if(!response.ok)fail('RETRIEVAL_TRANSPORT_ERROR');
    this.session=response.headers.get('mcp-session-id')||this.session;
    if(notification)return;
    const reader=response.body.getReader();let size=0;const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8e6){await reader.cancel();fail('RESPONSE_TOO_LARGE');}chunks.push(value);}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{fail('INVALID_MCP_RESPONSE');}
    if(body.error||!body.result)fail('MCP_PROTOCOL_ERROR');
    return body.result;
  }
  async connect(){
    const r=await this.rpc('initialize',{protocolVersion:this.protocol,capabilities:{},clientInfo:{name:'nexo-atlas-private',version:'1.3.0'}});
    this.protocol=r.protocolVersion;await this.rpc('notifications/initialized',{},true);this.connected=true;
    const cap=await this.call('nexo_retrieval_capabilities',{});
    if(cap.authenticated_subject!==this.expectedSubject){await this.close();fail('PRINCIPAL_BINDING_MISMATCH');}
    return cap;
  }
  async call(name,args){
    if(!this.connected)fail('CONNECTOR_NOT_CONNECTED');
    const r=await this.rpc('tools/call',{name,arguments:args});
    if(r.isError){const code=r.content?.[0]?.text;fail(/^[A-Z_]{3,80}$/.test(code||'')?code:'RETRIEVAL_TOOL_ERROR');}
    return r.structuredContent;
  }
  async close(){
    if(this.session)try{await this.fetchImpl(this.endpoint,{method:'DELETE',headers:{Authorization:`Bearer ${this.token}`,'MCP-Session-Id':this.session,'MCP-Protocol-Version':this.protocol},redirect:'error',signal:AbortSignal.timeout(3000)});}catch{}
    this.session=null;this.connected=false;
  }
}
