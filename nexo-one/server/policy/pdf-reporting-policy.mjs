const freezePreset=(id,label,family,signature,compatibility)=>Object.freeze({id,label,family,signature,compatibility});

export const PDF_PRESETS=Object.freeze({
  'swiss-signal':freezePreset('swiss-signal','SWISS_SIGNAL','editorial-system','Grid + scale + signal color',{PDF:'strong',INFOGRAPHIC:'strong',PPTX:'strong'}),
  'mission-control':freezePreset('mission-control','MISSION_CONTROL','operational','Operational surface, not dashboard cards',{PDF:'strong',INFOGRAPHIC:'good',PPTX:'strong'}),
  'editorial-shock':freezePreset('editorial-shock','EDITORIAL_SHOCK','editorial','Every spread changes rhythm',{PDF:'good',INFOGRAPHIC:'strong',PPTX:'strong'}),
  'museum-archive':freezePreset('museum-archive','MUSEUM_ARCHIVE','archive-luxury','Object as specimen',{PDF:'strong',INFOGRAPHIC:'good',PPTX:'good'}),
  'lab-notebook':freezePreset('lab-notebook','LAB_NOTEBOOK','scientific','Artifact behaves like research instrument',{PDF:'strong',INFOGRAPHIC:'good',PPTX:'good'}),
  'data-newsroom':freezePreset('data-newsroom','DATA_NEWSROOM','data-editorial','The chart carries the argument',{PDF:'strong',INFOGRAPHIC:'strong',PPTX:'strong'}),
  'raw-brutal':freezePreset('raw-brutal','RAW_BRUTAL','brutalist','Nothing decorative survives',{PDF:'good',INFOGRAPHIC:'strong',PPTX:'strong'}),
  'generative-geometry':freezePreset('generative-geometry','GENERATIVE_GEOMETRY','data-driven-identity','Identity changes with the data',{PDF:'good',INFOGRAPHIC:'strong',PPTX:'strong'}),
  'quiet-japan':freezePreset('quiet-japan','QUIET_JAPAN','minimal-editorial','Silence is part of hierarchy',{PDF:'strong',INFOGRAPHIC:'good',PPTX:'good'}),
  'type-matrix':freezePreset('type-matrix','TYPE_MATRIX','typographic','Typography is the visualization',{PDF:'good',INFOGRAPHIC:'strong',PPTX:'strong'}),
  'ledger-78':freezePreset('ledger-78','LEDGER_78','institutional-record','Structure is explicit and auditable',{PDF:'strong',INFOGRAPHIC:'good',PPTX:'good'}),
  'monograph':freezePreset('monograph','MONOGRAPH','publication','Book logic, not app logic',{PDF:'strong',INFOGRAPHIC:'limited',PPTX:'good'}),
  'tech-review-12':freezePreset('tech-review-12','TECH_REVIEW_12','technology-editorial','Flexible technical publication grid',{PDF:'strong',INFOGRAPHIC:'strong',PPTX:'strong'}),
  'forensic-dossier':freezePreset('forensic-dossier','FORENSIC_DOSSIER','investigative','Evidence chain is the composition',{PDF:'strong',INFOGRAPHIC:'good',PPTX:'strong'}),
  'blueprint-system':freezePreset('blueprint-system','BLUEPRINT_SYSTEM','engineering-schematic','The page behaves like a drawing set',{PDF:'strong',INFOGRAPHIC:'strong',PPTX:'good'}),
  'market-terminal':freezePreset('market-terminal','MARKET_TERMINAL','financial-terminal','Dense comparative scanning',{PDF:'good',INFOGRAPHIC:'limited',PPTX:'strong'}),
  'cartographic-atlas':freezePreset('cartographic-atlas','CARTOGRAPHIC_ATLAS','spatial-atlas','Layers and geography lead the story',{PDF:'strong',INFOGRAPHIC:'strong',PPTX:'strong'}),
  'material-index':freezePreset('material-index','MATERIAL_INDEX','material-catalog','Systematic sample cataloguing',{PDF:'strong',INFOGRAPHIC:'good',PPTX:'good'}),
  'signal-zine':freezePreset('signal-zine','SIGNAL_ZINE','experimental-zine','Controlled visual collision',{PDF:'good',INFOGRAPHIC:'strong',PPTX:'strong'}),
  'data-brand-system':freezePreset('data-brand-system','DATA_BRAND_SYSTEM','data-brand','Charts and brand grammar are one system',{PDF:'strong',INFOGRAPHIC:'strong',PPTX:'strong'}),
  'architectonic':freezePreset('architectonic','ARCHITECTONIC','architectural','Monumental hierarchy with spatial discipline',{PDF:'strong',INFOGRAPHIC:'good',PPTX:'strong'}),
  'research-poster':freezePreset('research-poster','RESEARCH_POSTER','academic-poster','One-canvas research narrative',{PDF:'strong',INFOGRAPHIC:'strong',PPTX:'good'}),
});

export const PDF_REPORT_POLICY=Object.freeze({
  id:'PDF_REPORTING_V2',
  version:2,
  sourceAuthority:'Google Drive',
  sourceDocumentId:'12hpUHgXCcXQk9AWDrFj0tBp6tGXwfnhVDu7vEAMbiFE',
  sourceDocumentTitle:'NEXO · ARTIFACT · VISUAL GRAMMAR PRESET PACK · v1.0',
  askPresetWhenUnspecified:true,
  presetRequiredBeforeAuthoring:true,
  antiMetalinguage:true,
  validateRenderedOutput:true,
  instruction:'Quando o usuário pedir um PDF sem estilo ou preset definido, apresente os 22 presets canônicos do Visual Grammar Preset Pack e obtenha a escolha antes de autorar. Preserve a identidade do preset entre mídias e não colapse a saída para cards genéricos ou layout corporativo genérico. Escreva apenas conteúdo do relatório: dados, análise, evidência, inferência, conclusão e decisão. Elimine comentários sobre geração, renderização, validação, template, prova de capacidade ou propósito do próprio documento. Gere o PDF, renderize as páginas e valide legibilidade em tamanho final, paginação, clipping, sobreposição, glifos, tabelas e gráficos antes da entrega.',
});

function normalize(value){
  return String(value??'').trim().toLocaleLowerCase('pt-BR').replace(/[_-]+/g,' ').replace(/\s+/g,' ');
}

export function resolvePdfPreset(value){
  const raw=normalize(value);
  if(!raw)return null;
  const id=raw.replace(/\s+/g,'-');
  return PDF_PRESETS[id]||null;
}

export function buildPdfInstruction(preset){
  const selected=resolvePdfPreset(preset);
  if(!selected)return PDF_REPORT_POLICY.instruction;
  return `${PDF_REPORT_POLICY.instruction} Preset selecionado: ${selected.label}. Família: ${selected.family}. Assinatura visual: ${selected.signature}. Compatibilidade PDF: ${selected.compatibility.PDF}.`;
}

export function getPdfPolicy(preset){
  const selected=resolvePdfPreset(preset);
  return {
    policy:PDF_REPORT_POLICY,
    preset:selected,
    presets:Object.values(PDF_PRESETS),
    instruction:buildPdfInstruction(selected?.id),
  };
}
