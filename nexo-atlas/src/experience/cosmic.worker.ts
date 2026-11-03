import {cosmicGeometry} from './cosmic-geometry.ts';
self.onmessage=(event:MessageEvent<{count:number}>)=>{
  const result=cosmicGeometry(Math.min(12000,Math.max(600,event.data.count)));
  self.postMessage(result,{transfer:[result.positions.buffer,result.sizes.buffer]});
};
