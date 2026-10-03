"""One-time, exact-source integration on the authorized release branch only.

The build removes this script and its branch-only workflow before PR integration.
It does not access Drive, secrets, Tower state, or any production service.
"""
import hashlib
from pathlib import Path


def load(path, expected):
    p=Path(path);raw=p.read_bytes()
    actual=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
    if actual!=expected:raise RuntimeError('SOURCE_DRIFT:'+path)
    return p,raw.decode('utf-8')


def replace(text,old,new,count=1):
    if text.count(old)!=count:raise RuntimeError('PATCH_ANCHOR_MISMATCH:'+old[:70])
    return text.replace(old,new,count)

p,s=load('nexo-one/server/mcp/server.mjs','e66259289513f4ba6f1b9d3075e529a77abee4b4')
s=replace(s,"import {executeMcpTool} from './tools.mjs';","import {executeMcpTool} from './tools.mjs';\nimport {registerOperationalTools} from './operational-tools.mjs';\nimport {operationalForRequest} from './operational-runtime.mjs';")
s=replace(s,"name:'nexo-science',version:'1.3.0'","name:'nexo-science',version:'1.4.0'")
s=replace(s,'export function createNexoMcpServer({readSnapshot}){','export function createNexoMcpServer({readSnapshot,operational=null}){')
s=replace(s,'  return server;\n}', '  if(operational)registerOperationalTools(server,{...operational,z});\n  return server;\n}')
s=replace(s,'      return handler.fetch(request,options);', '''      const operational=await operationalForRequest(request);
      if(operational.principal){
        const privateHandler=createMcpHandler(()=>createNexoMcpServer({readSnapshot,operational}),{responseMode:'json'});
        try{return await privateHandler.fetch(request,options);}
        finally{await privateHandler.close();}
      }
      return handler.fetch(request,options);''')
p.write_text(s,encoding='utf-8',newline='\n')

p,s=load('nexo-one/server/inbox-gateway.mjs','a8f02e8ad9490b8a309ec123b574ec75dc0ec012')
s=replace(s,"import { GOOGLE_WRITE_SCOPES } from './adapters/connect.mjs';","import { GOOGLE_WRITE_SCOPES } from './adapters/connect.mjs';\nimport { isOperationalEnvelope } from './mcp/operational-queue.mjs';")
for signature in ('async function readSpool(', 'async function appendSpoolRow(', 'function fullSpoolRow('):s=replace(s,signature,'export '+signature)
s=replace(s,'function refusesGate(envelope) {','function refusesGate(envelope) {\n  if(isOperationalEnvelope(envelope))return true;')
p.write_text(s,encoding='utf-8',newline='\n')

p,s=load('.github/workflows/nexo-writer-robot.yml','80eb9a59edb05cf3f6df8f8cdc43ebafb1204f31')
anchor="      - name: Apply inbox to the Tower\n        id: robot\n        if: steps.cred.outputs.ok == 'true'\n        env:\n"
s=replace(s,anchor,anchor+'          GH_TOKEN: ${{ github.token }}\n          NEXO_OPERATIONAL_READER_JSON: ${{ secrets.NEXO_DRIVE_READER_JSON }}\n')
p.write_text(s,encoding='utf-8',newline='\n')
print('Integrated MCP, existing private spool, and Writer environment; cron unchanged.')
