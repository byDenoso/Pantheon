import {readdir,readFile} from 'node:fs/promises';
import {extname,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {detectStyleViolations,STYLE_POLICY} from '../server/policy/style-policy.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const SCAN_ROOTS=['src','server','docs'];
const TEXT_EXTENSIONS=new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.md','.mdx','.html','.json','.txt','.css']);
const EXCLUDED=new Set([
  'server/policy/style-policy.mjs',
]);

async function filesUnder(dir){
  const entries=await readdir(dir,{withFileTypes:true});
  const nested=await Promise.all(entries.map(async entry=>{
    const path=resolve(dir,entry.name);
    if(entry.isDirectory())return filesUnder(path);
    return [path];
  }));
  return nested.flat();
}

const findings=[];
for(const rootName of SCAN_ROOTS){
  const root=resolve(ROOT,rootName);
  for(const path of await filesUnder(root)){
    const rel=relative(ROOT,path).replaceAll('\\','/');
    if(EXCLUDED.has(rel)||!TEXT_EXTENSIONS.has(extname(path).toLowerCase()))continue;
    const source=await readFile(path,'utf8');
    for(const violation of detectStyleViolations(source))findings.push({file:rel,...violation});
  }
}

if(findings.length){
  console.error(`[style-lint] ${STYLE_POLICY.id}: ${findings.length} violation(s)`);
  for(const finding of findings)console.error(`${finding.file}:${finding.index} ${finding.rule} ${JSON.stringify(finding.excerpt)}`);
  process.exitCode=1;
}else{
  console.log(`[style-lint] ${STYLE_POLICY.id}: PASS`);
}
