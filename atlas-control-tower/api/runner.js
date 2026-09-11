const send=(res,status,payload)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.end(JSON.stringify(payload))};
export default async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
 return send(res,503,{ok:false,error:'READ_ONLY_DRIVE_SSOT',authority:'GOOGLE_DRIVE',detail:'Atlas runner disabled until a Drive-authorized writer exists.'});
}
