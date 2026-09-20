import {withGoogleAuth} from './_middleware.mjs';
import {bootstrapDriveFromGithub} from '../../lib/drive-bootstrap.mjs';

async function driveBootstrap(req,res,{send}){
  if(String(req.method||'GET').toUpperCase()!=='POST')return send(res,{error:'METHOD_NOT_ALLOWED'},405);
  try{return send(res,{ok:true,...await bootstrapDriveFromGithub()},200);}
  catch(error){return send(res,{ok:false,error:'DRIVE_BOOTSTRAP_FAILED',detail:String(error?.message||error).slice(0,240)},503);}
}
export default withGoogleAuth(driveBootstrap);
