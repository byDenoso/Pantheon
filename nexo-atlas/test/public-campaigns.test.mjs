import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
import {guardTests} from '../src/atlas/publicItems.ts';
import {groupPublicQuestions} from '../src/atlas/publicQuestionGroups.ts';
import {campaignBrief, campaignConditions, associatedTestKind} from '../src/atlas/publicCampaigns.ts';
const rows = guardTests(publicAtlasProjection().tests);
const groups = groupPublicQuestions(rows);
const catalog = JSON.parse(readFileSync('src/atlas/publicCampaignCatalog.json','utf8'));
const byKey = key => groups.find(group => group.id === `question-${key}`);

test('campaign presentation covers the same 36 question groups and 215 associated tests', () => {
  assert.equal(groups.length,36);
  assert.equal(groups.reduce((n,g)=>n+g.members.length,0),215);
  assert.ok(groups.every(group=>campaignBrief(group)));
  assert.equal(byKey('grupos-bao').total,48);
  for(const group of groups)for(const field of ['summary','limits','basis'])assert.ok(campaignBrief(group)[field]['pt-BR']);
});

test('editorial catalog contains only reviewed public text and no source, lineage, date or release identity', () => {
  const forbidden = /https?:\/\/|FAM-|CAMP-|CONTEST-|WORK-|HYP-|T-SCI-|T-META-|ROADMAP-|REQ-|INBOX-|appgprj_|actions\/runs|[a-f0-9]{24,}|\bolymp\w*|\bOLY\w*|(?<![\p{L}\p{N}])p[. _-]*e[. _-]*e?[. _-]*r(?![\p{L}\p{N}])|\bPCDM\b|\bpNGB\b|Miqueias|2026-\d\d-\d\d/iu;
  assert.doesNotMatch(JSON.stringify(catalog),forbidden);
  for(const brief of Object.values(catalog)) {
    assert.deepEqual(Object.keys(brief).sort(),['activity','basis','limits','summary']);
    for (const field of ['basis','limits','summary']) for(const locale of ['pt-BR','en']) {
      assert.ok(brief[field][locale].length>20);
      assert.doesNotMatch(brief[field][locale],/indisponível|indisponivel|TBD|a definir|unavailable/i);
    }
  }
  const model = readFileSync('src/atlas/publicCampaigns.ts','utf8');
  assert.doesNotMatch(model,/fetch\(|Date\(|campaign_id|updated_at|executed_at/);
});

test('the four-field publication and all scientific results are unchanged', () => {
  const digest = createHash('sha256').update(readFileSync('worker/public-tests.json')).digest('hex');
  assert.equal(digest,'a77870a4d47413a9a276ac786f419c92fd0d690054235372c417927da66225b4');
  const resultDigest = createHash('sha256').update(JSON.stringify(publicAtlasProjection().tests.map(row=>row.result))).digest('hex');
  assert.equal(resultDigest,'7e4a1c35d224b727c20dd50544ff10911bbb920143705420ab6e75be012d67fa');
});

test('common conditions require literal agreement across every associated test', () => {
  const group = byKey('calibracao-bao');
  const conditions=campaignConditions(group);
  assert.ok(conditions.length>=3);
  assert.equal(conditions.find(row=>row.key==='bao-scale').shared,false);
  assert.equal(conditions.find(row=>row.key==='matter-prior').shared,false);
  for(const condition of conditions.filter(row=>row.shared)) assert.ok(group.members.every(({test})=>test.method['pt-BR'].includes(condition.value['pt-BR'])));
  const method={'pt-BR':'Condições desta comparação: compilações Pantheon+; Ωm = 0,3 ± 0,01.',en:'Conditions.'};
  const sample = {members:[{test:{method}},{test:{method}}],total:2};
  const shared=campaignConditions(sample);assert.equal(shared.length,2);assert.ok(shared.every(row=>row.shared));
  assert.equal(shared.find(row=>row.key==='matter-prior').value['pt-BR'],'0,3 ± 0,01');
  sample.members[1]={test:{method:{...method,'pt-BR':'Método sem especificação desse parâmetro.'}}};
  assert.ok(campaignConditions(sample).every(row=>!row.shared));
  sample.members=[sample.members[0]];
  assert.ok(campaignConditions(sample).every(row=>!row.shared));
});

test('reruns and robustness retain their meaning and do not become discoveries',()=>{
  const group=byKey('faixas-supernovas'),brief=campaignBrief(group);
  assert.equal(group.members.filter(member=>associatedTestKind(member,brief,'pt-BR')==='Reexecução do mesmo desenho').length,3);
  assert.equal(group.members.filter(member=>associatedTestKind(member,brief,'pt-BR')==='Variação de robustez').length,48);
  const allKinds=groups.flatMap(group=>group.members.map(member=>associatedTestKind(member,campaignBrief(group),'pt-BR')));
  assert.doesNotMatch(allKinds.join(' '),/descoberta|independente/i);
});

test('summaries preserve conflicting outcomes and open comparisons rather than manufacture one verdict',()=>{
  assert.match(campaignBrief(byKey('grupos-bao')).summary['pt-BR'],/preferência persistiu.*Outras divisões concentraram/);
  assert.match(campaignBrief(byKey('grupos-bao')).limits['pt-BR'],/detecção global/);
  assert.match(campaignBrief(byKey('pontos-cosmologicos')).summary['pt-BR'],/Oito.*uma.*inconclusiva/);
  assert.match(campaignBrief(byKey('calibracao-previsoes')).summary['pt-BR'],/mínimos.*não foram alcançados/);
  assert.equal(campaignBrief({id:'unreviewed',total:2,members:[{},{}]}),null);
  const ui=readFileSync('src/atlas/ui/PublicTestList.tsx','utf8');
  assert.match(ui,/overview=\{groups.find/);
  assert.match(ui,/agrupadas por questão física/);
  assert.match(ui,/testes associados/);
  assert.doesNotMatch(ui,/\b\d+ campanhas\b|testes únicos|descobertas por dia/);
});
