import {createScientificMcpService} from '../lib/scientific-mcp.mjs';
import {createScientificMcpHttpHandler} from '../lib/scientific-mcp-http.mjs';
import {createTowerGithubGateway} from '../lib/tower-github-gateway.mjs';
import {createNexoSemanticGateway} from '../lib/nexo-semantic-gateway.mjs';
import {observeHealthIssue,startHealthRepair,resolveHealthIssue} from '../lib/nexo-health.mjs';

const gateway=createTowerGithubGateway();
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
const handler=createScientificMcpHttpHandler({gateway,service,semantic});

export default handler;
