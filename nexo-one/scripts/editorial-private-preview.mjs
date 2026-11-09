// NEXO private editorial preview. Reuse the existing Writer-approved public projection for publication.
// This tool NEVER writes to the public Atlas, dist, public/, or an API. No private source is embedded.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const sha=x=>createHash('sha256').update(x).digest('hex');
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const check=(ok,why)=>{if(!ok)throw new Error(why);};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const escape=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const blocked=/\bPEER\b|OLYMPUS|TOWER|AGENTS\.md|SHADOW_V2|(?:drive|docs)\.google\.com|\b(?:secret|bearer|api[_ -]?key|password|token)\s*[:=]|(?:file:\/\/|[A-Z]:\\|\/(?:home|workspace|tmp)\/)/i;
const clean=(s,label,max=2200)=>{check(typeof s==='string'&&s.trim().length>0&&s.length<=max,'INVALID_'+label);check(!blocked.test(s),'PRIVATE_'+label);return s.trim();};
const number=n=>n.toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3});
const percent=n=>(n>=0?'+':'')+n.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';

export function validateEditorialStudy(input){
 check(object(input)&&input.contract==='NEXO_EDITORIAL_CANDIDATE_V1','CANDIDATE_CONTRACT_INVALID');
 check(input.visibility==='PRIVATE'&&input.authorDecision==='PENDING','AUTHOR_APPROVAL_REQUIRED');
 check(input.level==='E1'&&input.destination==='ATLAS_STUDY_CANDIDATE','CLASSIFICATION_INVALID');
 check(typeof input.studyId==='string'&&/^[A-Z0-9_.:-]{10,120}$/.test(input.studyId),'STUDY_ID_INVALID');
 check(typeof input.familyKey==='string'&&/^[A-Z0-9_.:-]{8,120}$/.test(input.familyKey),'FAMILY_INVALID');
 check(object(input.copy),'COPY_MISSING');
 const copy={};
 for(const name of ['title','question','summary','method','interpretation','limitations','nextStep']){
   copy[name]=clean(input.copy[name],'COPY_'+name);
 }
 check(input.copy.noveltyStatus==='NOVELTY_CHECK_PENDING','NOVELTY_GATE_REQUIRED');
 check(finite(input.baselineDeltaChi2)&&input.baselineDeltaChi2>0,'BASELINE_INVALID');
 check(finite(input.materialThresholdPercent)&&input.materialThresholdPercent>=10&&input.materialThresholdPercent<=100,'THRESHOLD_INVALID');
 check(finite(input.tolerance)&&input.tolerance>0&&input.tolerance<=.1,'TOLERANCE_INVALID');
 check(object(input.review)&&input.review.independentImplementation===true&&input.review.sameObservationalData===true,'REVIEW_NOT_VERIFIED');
 const reviewMethod=clean(input.review.method,'REVIEW_METHOD',700);
 check(Array.isArray(input.surveys)&&input.surveys.length>=2&&input.surveys.length<=20,'SURVEYS_INVALID');
 const seen=new Set();
 const surveys=input.surveys.map(row=>{
   check(object(row)&&typeof row.id==='string'&&/^[A-Za-z0-9_.:-]{5,120}$/.test(row.id)&&!seen.has(row.id),'SURVEY_ID_INVALID');
   seen.add(row.id);
   const label=clean(row.label,'SURVEY_LABEL',70);
   check(Number.isInteger(row.remainingSupernovae)&&row.remainingSupernovae>0,'SURVEY_N_INVALID');
   check(finite(row.primaryDeltaChi2)&&finite(row.reviewDeltaChi2)&&row.primaryDeltaChi2>=0&&row.reviewDeltaChi2>=0,'DELTA_CHI2_INVALID');
   const error=Math.abs(row.primaryDeltaChi2-row.reviewDeltaChi2);
   check(error<=input.tolerance,'REVIEW_MISMATCH');
   const change=(row.reviewDeltaChi2/input.baselineDeltaChi2-1)*100;
   return {id:row.id,label,n:row.remainingSupernovae,primary:row.primaryDeltaChi2,review:row.reviewDeltaChi2,error,change,material:Math.abs(change)>=input.materialThresholdPercent};
 });
 check(Array.isArray(input.literature)&&input.literature.length<=15,'LITERATURE_INVALID');
 const literature=input.literature.map(item=>{
   check(object(item),'REFERENCE_INVALID');
   const title=clean(item.title,'REFERENCE_TITLE',400);
   const u=new URL(item.url);
   check(u.protocol==='https:'&&!u.username&&!u.password&&!/google\.com|localhost|127\.0\.0\.1/i.test(u.hostname),'REFERENCE_NOT_PUBLIC');
   return {title,url:u.href};
 });
 // No spread of raw input: privateEvidence, IDs, internal pointers and future fields are intentionally ignored.
 return {contract:'NEXO_EDITORIAL_PREVIEW_V1',studyId:input.studyId,familyKey:input.familyKey,visibility:'PRIVATE',authorDecision:'PENDING',level:'E1',
  copy,baseline:input.baselineDeltaChi2,threshold:input.materialThresholdPercent,reviewMethod,surveys,literature,
  summary:{count:surveys.length,material:surveys.filter(x=>x.material).length,maxError:Math.max(...surveys.map(x=>x.error))}};
}

export function renderEditorialStudy(study){
 check(study?.contract==='NEXO_EDITORIAL_PREVIEW_V1','NOT_VALIDATED');
 const c=study.copy,scale=Math.max(study.baseline,...study.surveys.map(x=>x.review))*1.12,baseline=study.baseline/scale*100;
 const bars=study.surveys.map(s=>[
  '<div class="line"><div><strong>',escape(s.label),'</strong><small>',s.n.toLocaleString('pt-BR'),' supernovas restantes</small></div>',
  '<div class="track"><span class="origin" style="left:',baseline.toFixed(2),'%"></span><span class="bar',s.material?' changed':'','" style="width:',(100*s.review/scale).toFixed(2),'%"></span></div>',
  '<div class="value"><b>',number(s.review),'</b><small>',percent(s.change),s.material?' / material':' / abaixo do limiar','</small></div></div>'
 ].join('')).join('');
 const refs=study.literature.map(x=>'<li><a target="_blank" rel="noopener noreferrer" href="'+escape(x.url)+'">'+escape(x.title)+'</a></li>').join('');
 const css=':root{color-scheme:dark;--bg:#05080e;--panel:#0a111c;--line:#263957;--ink:#edf3ff;--muted:#97abc7;--blue:#719dff}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}header{border-top:3px solid var(--blue);border-bottom:1px solid var(--line);padding:18px 25px;max-width:1200px;margin:auto;display:flex;justify-content:space-between;gap:16px;align-items:center}header strong{font-size:25px}header span{font-size:11px;color:var(--muted)}main{max-width:1120px;margin:auto;padding:55px 28px 90px}.tag{color:var(--blue);letter-spacing:.16em;font-size:11px;font-weight:750;text-transform:uppercase}h1{font-size:clamp(29px,4vw,46px);line-height:1.17;max-width:850px;letter-spacing:-.03em;margin:15px 0 22px}h2{font-size:22px;letter-spacing:-.02em}p{max-width:75ch;color:var(--muted)}.lead{color:#ccd8ea;font-size:18px}section{margin-top:62px}.notice{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--blue);padding:18px 23px}.plot{margin-top:26px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:20px}.line{display:grid;grid-template-columns:170px 1fr 190px;gap:16px;align-items:center;padding:16px 0;border-bottom:1px solid #1b2b43}.line:last-child{border:0}small{display:block;color:var(--muted);font-size:11px}.track{height:22px;background:#132039;position:relative}.origin{position:absolute;top:0;bottom:0;border-left:2px dashed #e3edff;z-index:2}.bar{position:absolute;top:3px;bottom:3px;left:0;background:var(--blue)}.bar.changed{background:#b7c3d5}.value b{font-size:16px}.scope{display:grid;grid-template-columns:1fr 1fr;gap:34px}.scope article{border-top:1px solid var(--line)}a{color:#a9c2ff;text-underline-offset:3px}li{margin-bottom:10px}footer{border-top:1px solid var(--line);padding-top:20px;margin-top:60px;font-size:12px;color:var(--muted)}@media(max-width:700px){main{padding:32px 16px}.scope{grid-template-columns:1fr}.line{grid-template-columns:1fr 150px;gap:8px}.track{grid-column:1/-1;grid-row:2}.value{text-align:right}.plot{padding:12px}header span{max-width:120px;text-align:right}}';
 return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; connect-src &#39;none&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>NEXO | Previa editorial privada</title><style>'+css+'</style></head><body><header><strong>NEXO</strong><span>PREVIA PRIVADA / REVISAO AUTORAL PENDENTE</span></header><main><div class="tag">Estudos / Energia escura / E1</div><h1>'+escape(c.title)+'</h1><p class="lead">'+escape(c.summary)+'</p><p>'+escape(c.question)+'</p><section><h2>Resultado principal</h2><div class="notice">'+escape(c.interpretation)+'</div><div class="plot">'+bars+'<p>Referencia integral: delta qui-quadrado '+number(study.baseline)+'. Barras indicam melhoria de ajuste, nao significancia. '+study.summary.material+' de '+study.summary.count+' recortes mudaram ao menos '+study.threshold+'%.</p></div></section><section class="scope"><article><h2>Metodo e revisao</h2><p>'+escape(c.method)+'</p><p>'+escape(study.reviewMethod)+'</p></article><article><h2>Limites da inferencia</h2><p>'+escape(c.limitations)+'</p></article></section><section><h2>Proximo passo</h2><p>'+escape(c.nextStep)+'</p><div class="notice"><strong>Publicacao nao aprovada</strong><p>Esta previa e privada. A decisao do autor, a analise de originalidade e a cadeia de aprovacao do Writer continuam pendentes.</p></div></section><section><h2>Literatura relacionada</h2><ul>'+refs+'</ul></section><footer>Gerador editorial privado / nenhuma alteracao no Atlas publico</footer></main></body></html>';
}

function destination(p){
 const full=path.resolve(p);
 check(!/(^|\/)(public|dist|public_html|www|static|assets)(\/|$)/i.test(full),'PUBLIC_OUTPUT_FORBIDDEN');
 return full;
}
export async function buildEditorialStudy(inputFile,outDir){
 const output=destination(outDir);
 const stat=await fs.lstat(output).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 check(!stat?.isSymbolicLink(),'SYMLINK_OUTPUT_FORBIDDEN');
 const raw=await fs.readFile(inputFile,'utf8'),study=validateEditorialStudy(JSON.parse(raw));
 const model=JSON.stringify(study,null,2)+'\n',html=renderEditorialStudy(study);
 const manifest={contract:'NEXO_PRIVATE_EDITORIAL_PREVIEW_PACKAGE_V1',status:'PRIVATE_AUTHOR_REVIEW_PENDING',
  authorApproved:false,publicAtlasChanged:false,studyId:study.studyId,
  sourceSha256:sha(raw),projectionSha256:sha(model),htmlSha256:sha(html)};
 await fs.mkdir(output,{recursive:true});
 for(const [name,contents] of Object.entries({'preview.html':html,'projection.json':model,'manifest.json':JSON.stringify(manifest,null,2)+'\n'})){
  const tmp=path.join(output,'.'+name+'.'+randomUUID()+'.tmp'),dest=path.join(output,name);
  try{await fs.writeFile(tmp,contents,{flag:'wx',mode:0o600});await fs.rename(tmp,dest);}finally{await fs.rm(tmp,{force:true});}
  check(await fs.readFile(dest,'utf8')===contents,'READBACK_FAILED');
 }
 return {status:'PRIVATE_PREVIEW_VERIFIED',studyId:study.studyId,changes:study.summary.material,sourceSha256:manifest.sourceSha256,output};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2),input=args[args.indexOf('--input')+1],out=args[args.indexOf('--out')+1];
 check(args.includes('--input')&&args.includes('--out')&&input&&out,'USAGE: --input FILE --out PRIVATE_DIR');
 console.log(JSON.stringify(await buildEditorialStudy(input,out)));
}
