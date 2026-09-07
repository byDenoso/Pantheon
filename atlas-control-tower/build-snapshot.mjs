import fs from 'node:fs';import zlib from 'node:zlib';
const raw={};for(const file of fs.readdirSync('baseline').filter(x=>x.endsWith('.json')&&x!=='ops.json'))raw[file.slice(0,-5)]=JSON.parse(fs.readFileSync('baseline/'+file));
const snapshot={capturedAt:new Date().toISOString(),raw,ops:JSON.parse(fs.readFileSync('baseline/ops.json'))};
fs.writeFileSync('lib/snapshot.mjs','export default '+JSON.stringify(zlib.gzipSync(JSON.stringify(snapshot)).toString('base64'))+';\n');
console.log('Snapshot compressed bytes',fs.statSync('lib/snapshot.mjs').size);
