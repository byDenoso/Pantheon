// Layout-only helpers: never transform, round or remove published values.
export function wrapPlotLabel(text:string,width:number,fontSize=14):string[] {
  const limit=Math.max(8,Math.floor(width/(fontSize*.6))),rows:string[]=[];
  let row='';
  for(const word of text.split(/\s+/)){
    if(row&&row.length+word.length+1>limit){rows.push(row);row='';}
    let rest=word;
    while(rest.length>limit){if(row){rows.push(row);row='';}rows.push(rest.slice(0,limit));rest=rest.slice(limit);}
    if(rest)row+=(row?' ':'')+rest;
  }
  if(row)rows.push(row);
  return rows;
}

export function responsivePlotLayout(measuredWidth:number,xLabel:string,yLabel:string,yTicks:string[],xTicks:string[]=[]){
  const width=Math.min(800,Math.max(160,Number.isFinite(measuredWidth)&&measuredWidth>0?measuredWidth:800));
  const top=48,bottom=316,plotHeight=bottom-top;
  const xLines=wrapPlotLabel(xLabel,width-24),yLines=wrapPlotLabel(yLabel,plotHeight);
  const yTickWidth=Math.max(0,...yTicks.map(t=>t.length))*7.2;
  const xTickWidth=Math.max(0,...xTicks.map(t=>t.length))*7.2;
  const left=Math.min(width*.5,Math.max(68,37+(yLines.length-1)*16+yTickWidth));
  const right=width-Math.min(width*.2,Math.max(24,xTickWidth/2+8));
  const plotWidth=right-left;
  return {width,height:380+Math.max(0,xLines.length-1)*16,top,bottom,plotHeight,left,right,plotWidth,
    xIntervals:Math.max(1,Math.min(4,Math.floor(plotWidth/Math.max(72,xTickWidth+16)))),xLines,yLines,markerRadius:4,hitRadius:22};
}
