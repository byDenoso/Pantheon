import {createHmac,timingSafeEqual,scryptSync,randomBytes} from 'node:crypto';
const age=8*60*60;
export const configured = env => !!env.NEXO_PASSWORD_HASH && (env.NEXO_SESSION_SECRET?.length||0)>=32;
const sign=(value,env)=>createHmac('sha256',env.NEXO_SESSION_SECRET).update(value).digest('base64url');
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function makeSession(env,now=Date.now()) {const value=Buffer.from(JSON.stringify({exp:Math.floor(now/1000)+age,nonce:randomBytes(16).toString('hex')})).toString('base64url');return `${value}.${sign(value,env)}`;}
export function authenticated(req,env,now=Date.now()) {
  if(!configured(env))return false;
  const cookie=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('nexo_session='))?.slice(13)||'';
  const [value,sig]=cookie.split('.');
  if(!value||!sig||!equal(sig,sign(value,env)))return false;
  try{const p=JSON.parse(Buffer.from(value,'base64url').toString());return Number.isFinite(p.exp)&&p.exp>now/1000&&p.exp<=now/1000+age+60;}catch{return false;}
}
export function verifyPassword(value,hash) {
  try{const [kind,salt,expected]=hash.split('$');if(kind!=='scrypt'||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(expected))return false;return equal(scryptSync(value,salt,64).toString('hex'),expected);}catch{return false;}
}
export function cookie(value,req,clear=false){return `nexo_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear?0:age}${req.headers.host?.startsWith('127.0.0.1:')||req.headers.host?.startsWith('localhost:')?'':'; Secure'}`;}
export function sameOrigin(req) {try{const origin=new URL(req.headers.origin);return origin.host===req.headers.host&&(origin.protocol==='https:'||origin.hostname==='127.0.0.1'||origin.hostname==='localhost');}catch{return false;}}
