export type DatedEvent={when:number|null;kind:string};
export type ActivityBin={at:number;kind:'mural'|'resultado'|'resumo';count:number};
/** Registration time, never interpreted as execution time or scientific productivity. */
export function activityBins(events:readonly DatedEvent[],end:number,hours:number):ActivityBin[]{
  const start=end-hours*3_600_000,kinds=['mural','resultado','resumo'] as const;
  const bins=Array.from({length:hours},(_,i)=>kinds.map(kind=>({at:start+i*3_600_000,kind,count:0}))).flat();
  for(const event of events){if(event.when===null||!Number.isFinite(event.when)||event.when<start||event.when>=end)continue;const k=kinds.indexOf(event.kind as typeof kinds[number]);if(k>=0)bins[Math.floor((event.when-start)/3_600_000)*3+k]!.count++;}
  return bins;
}
