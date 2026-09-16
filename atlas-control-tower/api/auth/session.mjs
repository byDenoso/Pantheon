import { withGoogleAuth, send } from '../private/_middleware.mjs';

const verifiedSession=withGoogleAuth((req,res)=>{
  send(res,{email:req.session.email,authenticated:true,clientId:String(process.env.GOOGLE_CLIENT_ID||'').trim()});
});

function bearer(req){return /^Bearer\s+.+/i.test(String(req.headers?.authorization||''));}
function sameOrigin(req,origin){
  if(!origin)return true;
  const host=String(req.headers?.host||'').trim();
  return Boolean(host)&&(origin===`https://${host}`||origin===`http://${host}`);
}

export default async function authSession(req,res){
  const origin=req.headers?.origin||null;
  if(origin==='https://bydenoso.github.io'||sameOrigin(req,origin)){
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  }
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');
  if(String(req.method||'GET').toUpperCase()==='OPTIONS'){res.statusCode=204;return res.end?.('');}
  if(String(req.method||'GET').toUpperCase()!=='GET')return send(res,{error:'METHOD_NOT_ALLOWED'},405);
  if(bearer(req))return verifiedSession(req,res);
  const clientId=String(process.env.GOOGLE_CLIENT_ID||'').trim();
  const allowlistConfigured=Boolean(String(process.env.NEXO_ALLOWED_EMAILS||'').trim());
  return send(res,{authenticated:false,authConfigured:Boolean(clientId&&allowlistConfigured),clientId:clientId||null});
}
