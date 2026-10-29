import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {responsivePlotLayout,wrapPlotLabel} from '../src/atlas/plotLayout.ts';
import {plotDomain,plotCsv} from '../src/atlas/publicVisuals.ts';
import {visualPublicProjection} from '../worker/public-visuals.mjs';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
import {publicEditorialProjection} from '../worker/public-editorial.mjs';
import {campaignPublicProjection} from '../worker/public-campaigns.mjs';
import {cosmologyPublicProjection} from '../worker/public-cosmology.mjs';

const css=readFileSync('src/atlas/site-living.css','utf8');
const view=readFileSync('src/atlas/ui/InteractivePlot.tsx','utf8');
test('technical plots fit narrow frames without the former fixed 580px minimum',()=>{
 assert.match(css,/\.nexo-plot-svg\{width:100%;height:auto;display:block/);
 assert.match(css,/\.nexo-plot-frame \.nexo-plot-svg\{min-width:0;max-width:100%\}/);
 assert.doesNotMatch(css,/\.nexo-plot-frame \.nexo-plot-svg\{[^}]*min-width:580px/);
 assert.match(view,/className="nexo-plot-frame" role="region" tabIndex=\{0\}/);
 assert.match(view,/en\?'Interactive plot':'Gráfico interativo'/);
 assert.match(view,/viewBox=\{`0 0 \$\{layout.width\} \$\{layout.height\}`\}/);
 assert.match(view,/<desc>/);
 assert.match(view,/\[1,2,4,8\]/);
 assert.match(view,/disabled=\{zoom===1\}/);
 assert.match(view,/<input type="range"/);
 assert.match(view,/<table><caption>/);
});

test('the 91% source value and data domain remain exact and complete at 1×',()=>{
 const pub=cosmologyPublicProjection(visualPublicProjection(publicEditorialProjection(campaignPublicProjection(publicAtlasProjection()))));
 const plot=pub.visuals.find(v=>v.id==='summary-b23ed913238c1ec20f39-1').plot;
 assert.deepEqual(plot.series[0].points,[{x:1,y:91}]);
 const domain=plotDomain(plot,new Set(plot.series.map(s=>s.id)));
 assert.ok(domain.x[0]<1&&domain.x[1]>1);
 assert.ok(domain.y[0]<91&&domain.y[1]>91);
 for(const locale of ['pt-BR','en'])assert.ok(plotCsv(plot,locale).endsWith(',1,91,,'));
});


test('responsive coordinates keep labels and marker targets readable inside phone cards',()=>{
 for(const width of [167,195,205,245,275,400,580,800,1024])for(const locale of ['pt-BR','en']){
  const xLabel=locale==='en'?'Comparison category':'Categoria de comparação';
  const yLabel=locale==='en'?'Reduction in fit improvement (%)':'Redução da melhora do ajuste (%)';
  const layout=responsivePlotLayout(width,xLabel,yLabel,['0','24.12','48.23','72.35','96.46']);
  const scale=width/layout.width;
  assert.ok(12*scale>=10,`tick font at ${width}`);
  assert.ok(layout.markerRadius*2*scale>=8,`marker at ${width}`);
  assert.ok(layout.hitRadius*2*scale>=44,`pointer target at ${width}`);
  assert.ok(layout.height>=380&&layout.plotHeight===268);
  assert.ok(layout.left>0&&layout.right<layout.width&&layout.plotWidth>40);
  assert.ok(layout.xIntervals>=1&&layout.xIntervals<=4);
  assert.equal(layout.xLines.join(' '),xLabel);
  assert.equal(layout.yLines.join(' '),yLabel);
  const center=layout.left+layout.plotWidth/2;
  assert.ok(center-layout.markerRadius>=0&&center+layout.markerRadius<=layout.width);
 }
 assert.match(view,/new ResizeObserver\(schedule\)/);
 assert.match(view,/observer\?\.disconnect\(\)/);
 assert.match(view,/getScreenCTM\(\)/);
 assert.match(view,/matrixTransform\(matrix.inverse\(\)\)/);
 assert.match(view,/onPointerMove=\{inspectPoint\}/);
 assert.match(view,/event\.pointerType!=='mouse'\|\|inspectorOpen\|\|document\.hidden/);
 assert.match(view,/const activatePointer=\(event:MouseEvent<SVGSVGElement>\)=>\{const row=nearest\(event\.clientX,event\.clientY\);if\(row\)selectRow\(row,true,frame\.current\);\}/);
 assert.match(view,/onClick=\{activatePointer\}/);
 assert.match(view,/aria-describedby=\{instructions\} onKeyDown=\{keyDown\}/);
 assert.match(view,/ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'/);
 assert.match(view,/event\.key==='Enter'\|\|event\.key===' '/);
 assert.match(view,/event\.key==='Escape'/);
 assert.match(view,/role="status" aria-live="polite" aria-atomic="true"/);
 assert.match(view,/r=\{layout.hitRadius\}/);
});

test('long labels wrap without dropping words and exports follow the measured viewBox',()=>{
 const text='Published reductions in fit improvement with the complete scientific qualification';
 for(const width of [160,245,800])assert.equal(wrapPlotLabel(text,width).join(' '),text);
 assert.equal(wrapPlotLabel('https://nexoresearch.org/pesquisa/a-long-source-address',120).join(''),'https://nexoresearch.org/pesquisa/a-long-source-address');
 assert.match(view,/const width=svg.viewBox.baseVal.width,height=svg.viewBox.baseVal.height/);
 assert.match(view,/let yy=height\+30/);
 assert.match(view,/wrapPlotLabel\(note,width-32,13\)/);
 assert.match(view,/clone.querySelectorAll\('\.nexo-plot-hit'\)\.forEach\(node=>node.remove\(\)\)/);
});
