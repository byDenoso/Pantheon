import fs from 'node:fs';
import {frontendFiles} from '../frontend-files.mjs';
const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url)));
config.builds=[...config.builds.filter(b=>b.use!=='@vercel/static'),...frontendFiles.map(src=>({src,use:'@vercel/static'}))];
fs.writeFileSync(new URL('../vercel.json',import.meta.url),JSON.stringify(config,null,2)+'\n');
