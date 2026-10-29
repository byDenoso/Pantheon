import{readFileSync,readdirSync}from'node:fs';import{resolve,dirname}from'node:path';import{gzipSync}from'node:zlib';
for(const root of process.argv.slice(2)){
 const base=resolve(root,'server/private-ui'),html=readFileSync(base+'/index.html','utf8'),entry=html.match(/<script[^>]+src="[^"]*\/([^/]+\.js)"/)?.[1];if(!entry)throw new Error('PRIVATE_ENTRY_MISSING');
 const all=readdirSync(base+'/assets');
 const measure=starts=>{const seen=new Set(),visit=name=>{if(seen.has(name))return;seen.add(name);const code=readFileSync(base+'/assets/'+name,'utf8');for(const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*)["']\.\/([^"']+\.js)["']/g))visit(m[1]);};starts.forEach(visit);return {files:[...seen].sort(),bytes:[...seen].reduce((sum,name)=>sum+readFileSync(base+'/assets/'+name).length,0),gzip_bytes:[...seen].reduce((sum,name)=>sum+gzipSync(readFileSync(base+'/assets/'+name)).length,0)};};
 console.log(JSON.stringify({checkout:resolve(root),entry:measure([entry]),teia:measure([entry,...all.filter(name=>/^(?:PrivateWorkspace|TowerCosmos)-.+\.js$/.test(name))])},null,2));
}
