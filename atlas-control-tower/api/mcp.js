import {createScientificMcpService} from '../lib/scientific-mcp.mjs';
import {createScientificMcpHttpHandler} from '../lib/scientific-mcp-http.mjs';
import {createTowerGithubGateway} from '../lib/tower-github-gateway.mjs';

const gateway=createTowerGithubGateway();
const service=createScientificMcpService({gateway});
const handler=createScientificMcpHttpHandler({gateway,service});

export default handler;
