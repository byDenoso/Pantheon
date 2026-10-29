import {build} from 'vite';import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const temp=resolve('.sites-runtime/figures-render');await mkdir(temp,{recursive:true});
await writeFile(temp+'/entry.tsx',`
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import assert from 'node:assert/strict';
import InteractivePlot from '../../src/atlas/ui/InteractivePlot.tsx';
import data from '../../worker/public-summary-visuals.json';
let count=0;for(const locale of ['pt-BR','en'])for(const record of data.records)for(const p of record.plots){
 const html=renderToStaticMarkup(<InteractivePlot plot={p.plot} title={p.title[locale]} locale={locale}/>);
 assert.match(html,/nexo-summary-figure/);assert.match(html,/nexo-stat-number/);assert.match(html,/nexo-technical-plot/);assert.doesNotMatch(html,/nexo-data-table/);const detail=renderToStaticMarkup(<InteractivePlot plot={p.plot} title={p.title[locale]} locale={locale} detailed/>);assert.match(detail,/nexo-data-table/);assert.doesNotMatch(html,/NaN|Infinity/);count++;
}console.log('Rendered '+count+' bilingual numeric panels with details and source values.');
`);
await build({configFile:false,logLevel:'warn',build:{ssr:temp+'/entry.tsx',outDir:temp+'/out',rollupOptions:{output:{entryFileNames:'render.mjs'}}}});
await import(pathToFileURL(temp+'/out/render.mjs'));
