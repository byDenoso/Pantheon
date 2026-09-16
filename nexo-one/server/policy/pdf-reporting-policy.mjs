const freezePreset=(id,label,description,visual)=>Object.freeze({id,label,description,visual});

export const PDF_PRESETS=Object.freeze({
  'premium-dark':freezePreset('premium-dark','Premium Dark','Dashboard técnico premium, fundo escuro, cards, métricas e gráficos com alta hierarquia visual.','dark-dashboard'),
  'premium-light':freezePreset('premium-light','Premium Light','Relatório executivo claro, limpo e elegante, com bastante espaço, tabelas e gráficos discretos.','light-executive'),
  scientific:freezePreset('scientific','Scientific','Relatório científico ou técnico com estrutura formal, tabelas, figuras, legendas, referências e alta densidade informacional.','scientific-report'),
  operational:freezePreset('operational','Operational','Auditoria operacional orientada a diagnóstico, evidência, risco, decisão e próxima ação.','operational-audit'),
  editorial:freezePreset('editorial','Editorial','Relatório visual de consultoria com tipografia forte, composição editorial e narrativa visual controlada.','editorial-consulting'),
  minimal:freezePreset('minimal','Minimal','Documento seco e compacto, quase sem decoração, priorizando legibilidade, informação e velocidade de leitura.','minimal-report'),
});

const ALIASES=Object.freeze({
  'premium dark':'premium-dark',dark:'premium-dark',
  'premium light':'premium-light',light:'premium-light',
  scientific:'scientific',cientifico:'scientific','científico':'scientific',
  operational:'operational',operacional:'operational',
  editorial:'editorial',minimal:'minimal',minimo:'minimal','mínimo':'minimal',
});

export const PDF_REPORT_POLICY=Object.freeze({
  id:'PDF_REPORTING_V1',
  version:1,
  askPresetWhenUnspecified:true,
  presetRequiredBeforeAuthoring:true,
  antiMetalinguage:true,
  validateRenderedOutput:true,
  instruction:'Quando o usuário pedir um PDF sem estilo ou preset definido, apresente os seis presets e obtenha a escolha antes de autorar. Escreva apenas conteúdo do relatório: dados, análise, evidência, inferência, conclusão e decisão. Elimine comentários sobre geração, renderização, validação, template, prova de capacidade ou propósito do próprio documento. Gere o PDF, renderize as páginas e valide clipping, sobreposição, glifos, tabelas e gráficos antes da entrega.',
});

function normalize(value){
  return String(value??'').trim().toLocaleLowerCase('pt-BR').replace(/[_-]+/g,' ').replace(/\s+/g,' ');
}

export function resolvePdfPreset(value){
  const raw=normalize(value);
  if(!raw)return null;
  const id=ALIASES[raw]||raw.replace(/\s+/g,'-');
  return PDF_PRESETS[id]||null;
}

export function buildPdfInstruction(preset){
  const selected=resolvePdfPreset(preset);
  if(!selected)return PDF_REPORT_POLICY.instruction;
  return `${PDF_REPORT_POLICY.instruction} Preset selecionado: ${selected.label}. Direção visual: ${selected.description}`;
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
