import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('NEXO ONE and its system map share clear navigation and operational language',async()=>{
  const [nav,overview,app,mcp,css]=await Promise.all([
    text('src/app/navigation.ts'),
    text('src/features/system/Overview.tsx'),
    text('src/app/App.tsx'),
    text('src/mcp/McpAtlasApp.tsx'),
    text('src/mcp/mcp-atlas.css'),
  ]);
  assert.doesNotMatch(nav,/O estado real, agora|O que merece sua atenção|Encontre\. Retome\. Avance/);
  assert.match(nav,/Estado atual, decisões pendentes e próximas etapas/);
  assert.match(overview,/Decisões que esperam por você/);
  assert.match(app,/EmbeddedMcp/);
  assert.match(app,/mcp\//);
  assert.match(mcp,/Veja quais ferramentas e recursos o NEXO tem disponíveis/);
  assert.match(mcp,/system-tabs/);
  assert.match(mcp,/data-system-tab=/);
  assert.match(css,/--surface-0:#f7fafc/);
  assert.match(css,/--accent:#0369a1/);
});

test('technical execution records are presented as useful Portuguese',async()=>{
  const {humanizeActionText,humanizeText}=await import('../src/viewmodels/tokens.ts');
  const [missionControl,composites]=await Promise.all([
    text('src/features/system/MissionControl.tsx'),
    text('src/components/composites.tsx'),
  ]);
  assert.equal(
    humanizeText('TOWER_V06 · T-MEGA26-LCDM-TRACER-DENSITY-151: Veredito técnico registrado: draft.'),
    'Registro central do NEXO · Resultado ainda em rascunho.',
  );
  assert.equal(
    humanizeActionText('Continuar T-H0HOM26-006 (Executor científico, próxima execução agendada).','SCIENCE'),
    'A automação científica retomará o teste pendente na próxima execução programada.',
  );
  assert.equal(
    humanizeActionText('Executar Teste de contestação-Teste de contestação-META-BATTERY26-001-RUNNER-CANARY-2-1 (Executor científico, próxima execução agendada).','ENGINEERING'),
    'A automação de engenharia executará a próxima verificação programada.',
  );
  assert.equal(
    humanizeActionText('Teste de contestação-Teste de contestação-META-BATTERY26-001-RUNNER-CANARY-2-1','ENGINEERING'),
    'Teste de contestação',
  );
  assert.doesNotMatch(missionControl,/Etapa seguinte registrada; descrição simples indisponível/);
  assert.match(missionControl,/nextStep && !isTechnicalText\(nextStep\)/);
  assert.match(composites,/humanizeActionText\(lane\.next_action, lane\.domain\)/);
  assert.doesNotMatch(composites,/>\{next\.title\} ↗</);
});
