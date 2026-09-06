const URL='https://ep-cool-lab-aw72uid0.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1/entities?select=entity_id&limit=1';
export default async function handler(req,res){
  const token=req.headers&&req.headers['x-vercel-oidc-token'];
  if(!token){res.statusCode=500;return res.end(JSON.stringify({ok:false,error:'OIDC_MISSING'}));}
  try{
    const r=await fetch(URL,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Accept-Profile':'science_v1'}});
    const body=await r.text();
    res.statusCode=200;
    res.setHeader('content-type','application/json');
    return res.end(JSON.stringify({ok:r.ok,status:r.status,statusText:r.statusText,body:body.slice(0,2000)}));
  }catch(e){res.statusCode=500;return res.end(JSON.stringify({ok:false,error:String(e&&e.message||e)}));}
}
