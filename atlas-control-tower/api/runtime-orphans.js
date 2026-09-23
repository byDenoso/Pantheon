import driveHandler from './runtime-drive.js';
import liveActivity from './live/activity.mjs';

const routeOf=req=>{const url=new URL(req.url||'/','https://atlas.local');return url.searchParams.get('route')||url.pathname.split('/').filter(Boolean).pop()||'health';};
export function createRuntimeOrphansHandler({drive=driveHandler,activity=liveActivity}={}){
  return function handler(req,res){
    if(routeOf(req)==='live-activity')return activity(req,res);
    return drive(req,res);
  };
}

const handler=createRuntimeOrphansHandler();
export default handler;
