import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,writeFile,realpath,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {guardTests} from '../src/atlas/publicItems.ts';
import {groupPublicQuestions} from '../src/atlas/publicQuestionGroups.ts';
import {publicationKey} from '../worker/public-publication.mjs';

// Synthetic revision metadata, existing public text, real component. The
// production registry and public artifact are never modified by this probe.
const artifact=JSON.parse(await readFile('worker/public-cosmology.json','utf8'));
const group=groupPublicQuestions(guardTests(Object.values(artifact.records))).find(group=>group.members.length>1);
const [a,b]=group.members.map(member=>member.test);
const versions=[{analysisId:'SYNTHETIC-analysis',version:'SYNTHETIC-1',status:'ongoing',sourceKeys:[publicationKey(a)]},{analysisId:'SYNTHETIC-analysis',version:'SYNTHETIC-2',status:'retracted',sourceKeys:[publicationKey(b)]}];
await mkdir(resolve('.sites-runtime'),{recursive:true});
const temp=await mkdtemp(resolve('.sites-runtime/revision-notice-'));
let server,browser;
try {
 await writeFile(join(temp,'registry.json'),JSON.stringify({contract:'NEXO_PUBLIC_RESULT_REGISTRY_V1',records:[{questionId:group.id,versions}]}));
 const entry=join(temp,'entry.tsx').replaceAll('\\','/');
 await writeFile(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import Notice from '${resolve('src/atlas/ui/StudyRevisionNotice.tsx').replaceAll('\\','/')}';const group=${JSON.stringify({...group,members:[group.members[0]]})};createRoot(document.getElementById('root')!).render(<><p>SYNTHETIC SOFTWARE TEST</p><Notice group={group} locale="pt-BR"/><Notice group={group} locale="en"/></>);`);
 const plugin={name:'synthetic-revision-source',enforce:'pre',resolveId(source,importer){return importer&&source.endsWith('researchRegistry.json')?join(temp,'registry.json'):null;},configureServer(server){server.middlewares.use('/revision-probe',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<div id="root"></div><script type="module" src="/@fs/${entry}"></script>`);});}};
 server=await createServer({configFile:false,root:process.cwd(),cacheDir:join(temp,'.vite'),logLevel:'error',plugins:[plugin],server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),await realpath('node_modules')]}}});
 await server.listen();
 browser=await chromium.launch({headless:true,args:['--disable-gpu'],...(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{})});
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/revision-probe`,{waitUntil:'networkidle',timeout:30000});
 await page.getByRole('complementary',{name:'Aviso de revisão científica',exact:true}).waitFor({timeout:10000});
 assert.match(await page.getByRole('complementary',{name:'Aviso de revisão científica',exact:true}).innerText(),/Retratado.*SYNTHETIC-2/s);
 assert.match(await page.getByRole('complementary',{name:'Scientific revision notice',exact:true}).innerText(),/Retracted.*SYNTHETIC-2/s);
 assert.deepEqual(errors,[]);
 console.log('PASS synthetic browser: stale selected text is explicitly labeled retracted, PT/EN.');
}finally{await browser?.close();await server?.close();await rm(temp,{recursive:true,force:true});}
