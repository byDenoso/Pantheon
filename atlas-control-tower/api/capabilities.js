import {createTowerGithubGateway} from '../lib/tower-github-gateway.mjs';
import {createCapabilitySemanticSurface} from '../lib/capability-semantic-surface.mjs';

const surface=createCapabilitySemanticSurface({towerGateway:createTowerGithubGateway()});

export default async function handler(req,res){
  try{
    if(req.method!=='GET'&&req.method!=='POST'){
      res.statusCode=405;res.setHeader('Allow','GET, POST');return res.end('Method Not Allowed');
    }
    const url=new URL(req.url||'/','https://nexo.local');
    const action=url.searchParams.get('action')||'list';
    let result;
    if(req.method==='GET'&&action==='list')result=await surface.getCapabilities();
    else if(req.method==='POST'&&action==='reconcile')result=await surface.reconcileCapability(req.body?.candidate??req.body??{});
    else if(req.method==='POST'&&action==='drift')result=await surface.getCapabilityDrift(req.body?.observed??[]);
    else{res.statusCode=404;return res.end('Capability action not found');}
    res.statusCode=200;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify(result));
  }catch(error){
    res.statusCode=400;res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify({error:String(error?.message||error)}));
  }
}
