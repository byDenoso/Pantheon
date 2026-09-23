import {createScientificMcpService} from '../lib/scientific-mcp.mjs';
import {createScientificMcpHttpHandler} from '../lib/scientific-mcp-http.mjs';
import {createTowerGateway,towerStorageMode} from '../lib/tower-gateway.mjs';
import {createNexoSemanticGateway} from '../lib/nexo-semantic-gateway.mjs';
import {observeHealthIssue,startHealthRepair,resolveHealthIssue} from '../lib/nexo-health.mjs';

function sendJson(res,status,payload){
  res.statusCode=status;
  res.setHeader?.('Content-Type','application/json; charset=utf-8');
  res.setHeader?.('Cache-Control','no-store');
  if(typeof res.status==='function'&&typeof res.json==='function')return res.status(status).json(payload);
  if(typeof res.end==='function')return res.end(JSON.stringify(payload));
  return payload;
}

async function retiredHandler(req,res){
  const method=String(req?.method||'GET').toUpperCase();
  if(method==='OPTIONS'){
    res.statusCode=204;
    res.setHeader?.('Allow','GET, OPTIONS');
    return res.end?.('');
  }
  const canonical={
    authority:'TOWER_V06',
    truth_owner:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',
    storage:'GOOGLE_DRIVE_PRIVATE',
    stable_file_id:'1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z',
    contract:'NEXO_TOWER_LIVE_V1',
    git_state_fallback:false,
  };
  if(method==='GET'){
    return sendJson(res,200,{
      ok:true,
      server:'nexo-legacy-mcp-retired',
      version:'1.1.0',
      status:'NONCANONICAL_DEPRECATED',
      authority:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',
      canonical,
      tools:[],
      mutation_policy:'FORBIDDEN_ON_LEGACY_GITHUB_SURFACE',
      message:'Legacy Vercel MCP is retired after Drive-primary cutover. Resolve the stable live Tower file from Google Drive or use the active Drive-bootstrapped runtime.',
    });
  }
  return sendJson(res,410,{
    ok:false,
    error:'LEGACY_MCP_RETIRED',
    status:'NONCANONICAL_DEPRECATED',
    canonical,
    message:'This legacy Vercel MCP surface is retired and cannot execute canonical operations after Drive-primary cutover.',
  });
}

function createActiveHandler(){
  const gateway=createTowerGateway();
  const service=createScientificMcpService({gateway});
  const semanticGateway=createNexoSemanticGateway({towerGateway:gateway});
  const semantic={
    async call(name,args={}){
      if(name==='nexo.observe_health_issue')return observeHealthIssue(semanticGateway,args);
      if(name==='nexo.start_health_repair')return startHealthRepair(semanticGateway,args);
      if(name==='nexo.resolve_health_issue')return resolveHealthIssue(semanticGateway,args);
      return semanticGateway.call(name,args);
    }
  };
  return createScientificMcpHttpHandler({gateway,service,semantic});
}

const storageMode=towerStorageMode();
const ACTIVE_DRIVE_MCP=storageMode==='DRIVE_PRIMARY';
const handler=ACTIVE_DRIVE_MCP?createActiveHandler():retiredHandler;

export default handler;
