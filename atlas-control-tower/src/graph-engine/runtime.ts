export type GraphRuntime={PIXI:any;gsap:any};
let runtimePromise:Promise<GraphRuntime>|null=null;
export function loadGraphRuntime(){
 if(runtimePromise)return runtimePromise;
 runtimePromise=Promise.all([import('pixi.js'),import('gsap')]).then(([PIXI,gsapModule])=>({PIXI,gsap:gsapModule.gsap||gsapModule.default||gsapModule}));
 return runtimePromise;
}
