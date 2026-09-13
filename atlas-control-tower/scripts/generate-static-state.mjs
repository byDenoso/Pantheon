import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateStaticState} from '../lib/campaign-static-state-generator.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outDir=path.resolve(root,process.argv[2]||'public/data');
fs.rmSync(outDir,{recursive:true,force:true});
const result=await generateStaticState({outDir});
console.log(`NEXO_STATIC_STATE_OK fingerprint=${result.fingerprint} out=${path.relative(root,outDir)}`);
