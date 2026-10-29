// Test-only constrained-GC harness. Never used by the application build/runtime.
import {cpSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
const source='node_modules/miniflare',target='node_modules/miniflare-bounded-proof';
if(existsSync(target))throw Error('BOUNDED_PROOF_COPY_ALREADY_EXISTS');
cpSync(source,target,{recursive:true});const file=target+'/dist/src/index.js',raw=readFileSync(file,'utf8'),needle='    const configBuffer = serializeConfig(config);';
if(raw.split(needle).length!==2)throw Error('MINIFLARE_VERSION_NOT_REVIEWED');
writeFileSync(file,raw.replace(needle,'    config.v8Flags = ["--max-old-space-size=96", "--max-semi-space-size=4"];\n'+needle));
console.log('Test copy prepared; original Miniflare unchanged. This is not the Cloudflare128MB policy enforcer.');
