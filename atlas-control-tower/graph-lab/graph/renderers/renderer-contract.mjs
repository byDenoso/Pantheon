export const GRAPH_RENDERER_METHODS=Object.freeze([
 'setGraph','setSelected','setTheme','setOptions','setPreset','fit','focusNode','reset','zoom','toggleFlat','start','stop','destroy'
]);

export function rendererContractReport(renderer){
 const missing=GRAPH_RENDERER_METHODS.filter(name=>typeof renderer?.[name]!=='function');
 return Object.freeze({ok:missing.length===0,missing});
}

export function assertGraphRenderer(renderer,id='renderer'){
 const report=rendererContractReport(renderer);
 if(!report.ok)throw new TypeError(`${id} violates GraphRenderer contract: ${report.missing.join(', ')}`);
 return renderer;
}
