import {driveGraph,DRIVE_SSOT_META} from '../lib/drive-ssot.mjs';

const queryOf=req=>{const u=new URL(req.url||'/','https://atlas.local');const q=Object.fromEntries(u.searchParams);delete q.route;return q};
const send=(res,status,payload)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','public, max-age=60, stale-while-revalidate=300');res.setHeader('X-Atlas-Authority','GOOGLE_DRIVE');return res.end(JSON.stringify(payload))};
const failureState=error=>/permission|forbidden|unauthor/i.test(String(error?.message||error))?'PERMISSION_ERROR':'SOURCE_UNAVAILABLE';

export default async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{ok:false,error:'READ_ONLY_DRIVE_SSOT'});
 const q=queryOf(req);
 if(q.describe==='1')return send(res,200,{contract:'drive-ssot-v1',authority:'GOOGLE_DRIVE',projectionOnly:true,sourceFileId:DRIVE_SSOT_META.sourceFileId,levels:['atlas','domain','detail']});
 try{return send(res,200,driveGraph(q))}
 catch(error){return send(res,503,{ok:false,state:failureState(error),error:String(error?.message||error),authority:'GOOGLE_DRIVE',projectionOnly:true})}
}
