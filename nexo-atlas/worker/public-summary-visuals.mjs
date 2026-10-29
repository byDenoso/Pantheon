import summaries from './public-summary-visuals.json' with {type:'json'};
import {publicationKey} from './public-publication.mjs';
import {guardVisual} from '../src/atlas/publicVisuals.ts';
// Presentation of values already in the public catalog. This does not issue a
// Writer approval, claim a new review, access Tower, or reconstruct raw samples.
export function summaryVisualProjection(projection, catalog=summaries) {
  const byContent=new Map((projection.tests??[]).map(t=>[publicationKey(t),t]));
  const visuals=[];
  for(const entry of catalog.records){
    const test=byContent.get(entry.sourceKey);
    if(!test)continue; // Retired or edited public evidence must not leave stale plots.
    for(const [index,plot] of entry.plots.entries()){
      const subject={kind:'legacy-test',...Object.fromEntries(['question','answers','method','result'].map(k=>[k,test[k]]))};
      const visual=guardVisual({
        id:`summary-${entry.sourceKey.slice(0,20)}-${index+1}`,
        presentation:'PUBLISHED_SUMMARY',subject,title:plot.title,
        caption:plot.caption,limitations:[test.answers,...plot.limitations],
        publishedAt:catalog.generatedAt,evidenceKind:entry.evidenceKind,
        sources:[{label:{'pt-BR':'Resumo público de origem (ver pergunta do teste)',en:'Source public summary (see test question)'},url:'https://nexoresearch.org/'}],
        plot:plot.plot,
      });
      if(!visual)throw new Error('PUBLIC_SUMMARY_VISUAL_INVALID');
      visuals.push(visual);
    }
  }
  const existing=projection.visuals??[];
  const all=[...existing,...visuals].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  return {...projection,visualsContract:'ATLAS_PUBLIC_VISUALS_V1',visuals:all};
}
