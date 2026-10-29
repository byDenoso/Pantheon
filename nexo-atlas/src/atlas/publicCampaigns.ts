import catalog from './publicCampaignCatalog.json' with {type: 'json'};
import type {QuestionGroup, QuestionMember} from './publicQuestionGroups.ts';
import type {Bilingual} from './publicItems.ts';
import type {Locale} from './api.ts';

export type Activity = 'investigation' | 'robustness' | 'comparison' | 'validation';
export type CampaignBrief = {summary: Bilingual; limits: Bilingual; basis: Bilingual; activity: Activity};
export type CampaignCondition = {key: string; label: Bilingual; value: Bilingual; shared: boolean};
const bilingual = (pt: string, en = pt): Bilingual => ({'pt-BR': pt, en});
const reviewed = catalog as Record<string, CampaignBrief>;

// These are editorial updates for the exact reviewed question groups. There are
// no canonical campaign IDs, source dates, lifecycle states, or private records.
// A singleton quotes its existing public fields. Unknown groups get no inferred
// aggregate scientific conclusion. Source publication still uses four fields.
export function campaignBrief(group: QuestionGroup): CampaignBrief | null {
  const key = group.id.replace(/^question-/, '');
  if (reviewed[key]) return reviewed[key];
  if (group.members.length === 1 && group.total === 1) {
    const {test} = group.members[0];
    return {summary: test.result, limits: test.answers, basis: test.method, activity: 'investigation'};
  }
  return null;
}

const fields = [
  {key: 'compilations', label: bilingual('Compilações de supernovas', 'Supernova compilations'), expression: /compilações ([^;]+)/},
  {key: 'matter-prior', label: bilingual('Prior de densidade de matéria', 'Matter-density prior'), expression: /Ωm = ([^;]+)/},
  {key: 'bao-scale', label: bilingual('Calibração da régua BAO', 'BAO-ruler calibration'), expression: /parâmetro de escala BAO = ([^;]+)/},
  {key: 'bao-release', label: bilingual('Versão dos dados BAO', 'BAO data release'), expression: /BAO DESI (DR\d)/},
  {key: 'redshift-bands', label: bilingual('Faixas de redshift', 'Redshift ranges'), expression: /faixas de redshift (.+)/},
  {key: 'bao-groups', label: bilingual('Grupos de redshift BAO', 'BAO redshift groups'), expression: /grupos de redshift (.+)/},
];

/** Only literal conditions present in every reviewed member can be called shared. */
export function campaignConditions(group: QuestionGroup): CampaignCondition[] {
  return fields.flatMap(field => {
    const values = group.members.map(({test}) => {
      const publicConditions = test.method['pt-BR'].split('Condições desta comparação: ')[1];
      if (!publicConditions) return null;
      const bounded = publicConditions.split('. Este registro repete')[0].replace(/\.$/, '');
      return field.expression.exec(bounded)?.[1]?.trim() ?? null;
    });
    if (!values.some(Boolean)) return [];
    const distinct = new Set(values.filter(Boolean));
    const shared = group.members.length === group.total && values.every(Boolean) && distinct.size === 1;
    const value = shared ? bilingual(values[0]!) : distinct.size > 1
      ? bilingual('Varia entre os testes', 'Varies across tests')
      : bilingual('Conferir nas condições de cada teste', 'See each test’s conditions');
    return [{key: field.key, label: field.label, value, shared}];
  });
}

export function associatedTestKind(member: QuestionMember, brief: CampaignBrief | null, locale: Locale): string {
  if (member.repeat) return locale === 'en' ? 'Same-design rerun' : 'Reexecução do mesmo desenho';
  if (brief?.activity === 'robustness') return locale === 'en' ? 'Robustness variation' : 'Variação de robustez';
  if (brief?.activity === 'validation') return locale === 'en' ? 'Execution or reproducibility check' : 'Verificação de execução ou reprodução';
  return locale === 'en' ? 'Associated test' : 'Teste associado';
}
