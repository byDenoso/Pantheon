import test from 'node:test';
import assert from 'node:assert/strict';
import {PDF_REPORT_POLICY,PDF_PRESETS,getPdfPolicy,resolvePdfPreset} from '../server/policy/pdf-reporting-policy.mjs';
import {detectStyleViolations} from '../server/policy/style-policy.mjs';
import {NEXO_MCP_TOOL_NAMES,executeNexoMcpTool} from '../server/mcp/server.mjs';

test('PDF policy exposes the six canonical presets',()=>{
  assert.equal(PDF_REPORT_POLICY.id,'PDF_REPORTING_V1');
  assert.deepEqual(Object.keys(PDF_PRESETS),[
    'premium-dark','premium-light','scientific','operational','editorial','minimal',
  ]);
});

test('PDF policy requires preset selection when style is unspecified',()=>{
  assert.equal(PDF_REPORT_POLICY.askPresetWhenUnspecified,true);
  assert.equal(resolvePdfPreset('Premium Dark').id,'premium-dark');
  assert.equal(resolvePdfPreset('operational').id,'operational');
});

test('PDF policy bans report metalinguage about generation and validation',()=>{
  const samples=[
    'O objetivo aqui não é o tema do relatório, mas provar que a saída pode ser produzida, renderizada e validada sem depender de um template externo.',
    'Este relatório demonstra que o PDF pode ser gerado e validado corretamente.',
    'A saída foi renderizada para validar o processo de geração.',
  ];
  for(const sample of samples){
    const violations=detectStyleViolations(sample);
    assert.ok(violations.some(item=>item.code==='REPORT_METALANGUAGE'),`expected metalinguage violation for: ${sample}`);
  }
});

test('MCP exposes PDF policy without reading the science snapshot',async()=>{
  assert.ok(NEXO_MCP_TOOL_NAMES.includes('get_pdf_policy'));
  const readSnapshot=()=>{throw new Error('SNAPSHOT_SHOULD_NOT_BE_READ')};
  const result=await executeNexoMcpTool({readSnapshot},'get_pdf_policy',{preset:'scientific'});
  assert.equal(result.policy.id,'PDF_REPORTING_V1');
  assert.equal(result.preset.id,'scientific');
  assert.match(result.instruction,/conteúdo do relatório/i);
});

test('getPdfPolicy returns all presets when no preset is requested',()=>{
  const result=getPdfPolicy();
  assert.equal(result.policy.id,'PDF_REPORTING_V1');
  assert.equal(result.preset,null);
  assert.equal(result.presets.length,6);
});
