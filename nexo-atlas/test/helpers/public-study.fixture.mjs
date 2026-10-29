// SYNTHETIC software QA only. Every question, label and number below is invented to
// exercise the investigation page. Never import this from application code, publish
// it, or read it as a scientific result, a published value or live Tower state.
export const SYNTHETIC_STUDY_NOTICE = 'SYNTHETIC SOFTWARE QA — invented values, not scientific evidence';
const bi = (pt, en = pt) => ({'pt-BR': pt, en});
const at = day => `2026-01-${String(day).padStart(2, '0')}T12:00:00.000Z`;

export const STUDY_KEY = 'exemplo-sintetico';
export const STUDY_ROUTE = '/pesquisa/exemplo-sintetico';
export const SINGLE_STUDY_KEY = 'exemplo-sintetico-isolado';
export const SINGLE_STUDY_ROUTE = `/pesquisa/${SINGLE_STUDY_KEY}`;

// Fourteen variations of one invented question. Some rows deliberately share the same
// visible label so the interface has to tell equal names apart without merging them.
const SETS = ['Conjunto A, Conjunto B', 'Conjunto A, Conjunto B, Conjunto C', 'Conjunto A, Conjunto C'];
const PRIORS = ['0,3 ± 0,01', '0,315 ± 0,03', '0,33 ± 0,01'];
const BANDS = ['0,01–0,15; 0,15–0,5; 0,5–2,3', '0,01–0,1; 0,1–0,3; 0,3–0,7; 0,7–2,3'];
const VALUES = [94, 93, 95, 58, 54, 50, 53, 33, 95, 61, 54, 72.5, 12.25, 88];

function variation(index) {
  // 9 and 11 are same-design reruns of 3 and 5 (told apart by their kind). 13 and 14 are ordinary
  // variations that happen to show exactly the label of 1 and 2: equal names, separate records.
  const twin = ({8: 2, 10: 4, 12: 0, 13: 1})[index] ?? index;
  // Mixed radix over (set, prior, band): every index below 18 gets a distinct visible label.
  const set = SETS[twin % 3], prior = PRIORS[Math.floor(twin / 3) % 3], band = BANDS[Math.floor(twin / 9) % 2];
  const cut = band.split('; ')[0];
  return {set, prior, band, cut, section: index < 10 ? 'Sensibilidade ao prior sintético' : 'Partições alternativas sintéticas', repeat: index === 8 || index === 10};
}

export function makePublicStudyFixture() {
  const tests = VALUES.map((value, index) => {
    const v = variation(index), n = index + 1;
    return {
      id: `SYNTHETIC-STUDY-${n}`,
      question: bi(`SINTÉTICO ${n}: a medida de exemplo depende da faixa ${v.cut} em ${v.set}?`, `SYNTHETIC ${n}: does the example measure depend on the ${v.cut.replace(/,/g, '.')} range in ${v.set.replace(/Conjunto/g, 'Set')}?`),
      answers: bi(`SINTÉTICO: o registro ${n} cobre só a seleção inventada descrita aqui.`, `SYNTHETIC: record ${n} covers only the invented selection described here.`),
      method: bi(`SINTÉTICO: o ajuste inventado é repetido retirando uma faixa por vez. Condições desta comparação: compilações ${v.set}; Ωm = ${v.prior}; faixas de redshift ${v.band}.`, `SYNTHETIC: the invented fit is repeated removing one range at a time. Conditions of this comparison: compilations ${v.set.replace(/Conjunto/g, 'Set')}; Ωm = ${v.prior.replace(/,/g, '.')}; redshift ranges ${v.band.replace(/,/g, '.')}.`),
      result: bi(`SINTÉTICO: retirar a faixa ${v.cut} reduziu a medida de exemplo em cerca de ${String(value).replace('.', ',')}%. Valor inventado para testar a interface.`, `SYNTHETIC: removing the ${v.cut.replace(/,/g, '.')} range reduced the example measure by about ${value}%. Invented value for interface tests.`),
      published_at: at(1 + index), updated_at: at(1 + index),
    };
  });
  // Two unrelated single-test questions keep the home catalog from being a one-row list.
  for (const [n, topic] of [[15, 'BAO'], [16, 'CMB']]) tests.push({
    id: `SYNTHETIC-STUDY-${n}`,
    question: bi(`SINTÉTICO ${n}: como a interface apresenta um estudo isolado de ${topic}?`, `SYNTHETIC ${n}: how does the interface present a single ${topic} study?`),
    answers: bi('SINTÉTICO: estudo isolado inventado.', 'SYNTHETIC: invented single study.'),
    method: bi('SINTÉTICO: verificação de apresentação apenas.', 'SYNTHETIC: presentation check only.'),
    result: bi('SINTÉTICO: nenhum resultado científico.', 'SYNTHETIC: no scientific result.'),
    published_at: at(n), updated_at: at(n),
  });

  const members = tests.slice(0, 14).map((test, index) => {
    const v = variation(index);
    return {question: test.question['pt-BR'], label: bi(v.set, v.set.replace(/Conjunto/g, 'Set')), detail: bi(`Ωm = ${v.prior} · z: ${v.band}`, `Ωm = ${v.prior.replace(/,/g, '.')} · z: ${v.band.replace(/,/g, '.')}`), section: bi(v.section, v.section === 'Sensibilidade ao prior sintético' ? 'Synthetic prior sensitivity' : 'Synthetic alternative partitions'), repeat: v.repeat};
  });
  const questionCatalog = [
    {key: STUDY_KEY, title: bi('SINTÉTICO: a medida de exemplo depende da faixa retirada?', 'SYNTHETIC: does the example measure depend on the removed range?'), scope: bi('SINTÉTICO: investigação inventada para testar a página.', 'SYNTHETIC: invented investigation for page tests.'), members},
    {key: SINGLE_STUDY_KEY, title: bi('SINTÉTICO: apresentação de um teste isolado', 'SYNTHETIC: presentation of one isolated test'), scope: bi('SINTÉTICO: rota isolada usada apenas para testar âncoras.', 'SYNTHETIC: isolated route used only to test anchors.'), members: [{question: tests[14].question['pt-BR'], label: bi('Teste sintético isolado'), detail: bi('Apenas interface'), section: bi('Teste isolado'), repeat: false}]},
  ];
  const campaignCatalog = {[STUDY_KEY]: {
    summary: bi('SINTÉTICO: nos exemplos inventados, retirar a primeira faixa reduziu a medida em até 95%. Com outro prior inventado a maior redução foi de 58%. Nenhum destes números é um resultado.', 'SYNTHETIC: in the invented examples, removing the first range reduced the measure by up to 95%. With another invented prior the largest reduction was 58%. None of these numbers is a result.'),
    limits: bi('SINTÉTICO: as porcentagens são inventadas e não medem probabilidade nem significância.', 'SYNTHETIC: the percentages are invented and measure neither probability nor significance.'),
    basis: bi('SINTÉTICO: o ajuste inventado é repetido após retirar uma faixa por vez.', 'SYNTHETIC: the invented fit is repeated after removing one range at a time.'),
    activity: 'robustness',
  }};

  // One published-summary figure per test. The series label keeps a dot decimal on purpose
  // ("z = 0.01–0.15"): the page must show it localised while exports keep the catalog text.
  const visuals = tests.slice(0, 14).map((test, index) => {
    const v = variation(index), cutDots = v.cut.replace(/,/g, '.');
    const set = v.set.split(', ')[0];
    return {
      presentation: 'PUBLISHED_SUMMARY', id: `synthetic-summary-${index + 1}`,
      subject: {kind: 'legacy-test', question: test.question, answers: test.answers, method: test.method, result: test.result},
      title: bi('SINTÉTICO: maior redução inventada da medida', 'SYNTHETIC: largest invented reduction of the measure'),
      caption: bi(`SINTÉTICO: retirar a faixa ${v.cut} reduziu a medida inventada em cerca de ${String(VALUES[index]).replace('.', ',')}%.`, `SYNTHETIC: removing the ${cutDots} range reduced the invented measure by about ${VALUES[index]}%.`),
      limitations: [bi('SINTÉTICO: valor inventado; não há dado de pesquisa.', 'SYNTHETIC: invented value; there is no research data.')],
      publishedAt: at(1 + index), evidenceKind: 'SCIENTIFIC_RESULT',
      // Mirrors the self-referential source the summary projection emits today.
      sources: [{label: bi('Resumo público de origem (ver pergunta do teste)', 'Source public summary (see test question)'), url: 'https://nexoresearch.org/'}],
      plot: {x: {label: bi('Categoria de comparação', 'Comparison category'), unit: ''}, y: {label: bi('Redução sintética da medida', 'Synthetic reduction of the measure'), unit: '%'}, style: 'scatter',
        series: [{id: `synthetic-series-${index + 1}`, label: bi(`${set}: retirar z = ${cutDots}`, `${set.replace('Conjunto', 'Set')}: remove z = ${cutDots}`), points: [{x: 1, y: VALUES[index]}]}]},
    };
  });

  // Reviewed-comparison membership. `revision` is filled by the caller with the same
  // checksum the application computes, from the guarded visual.
  const comparisonSpec = [
    {id: 'synthetic-comparison-a', title: bi('SINTÉTICO A: sensibilidade inventada ao prior e às faixas', 'SYNTHETIC A: invented sensitivity to prior and ranges'), members: [0, 1, 2, 3]},
    {id: 'synthetic-comparison-b', title: bi('SINTÉTICO B: sensibilidade inventada ao prior e às faixas', 'SYNTHETIC B: invented sensitivity to prior and ranges'), members: [4, 5, 6, 7, 8, 9]},
  ].map(group => ({...group,
    caption: bi('SINTÉTICO: mesma métrica inventada em todas as linhas. Comparamos só a maior redução inventada. As porcentagens não são probabilidades. Cada linha preserva um registro; configurações relacionadas não são amostras independentes. Não calculamos média nem resultado combinado.', 'SYNTHETIC: the same invented metric on every row. Only the largest invented reduction is compared. The percentages are not probabilities. Each row preserves one record; related configurations are not independent samples. No mean or combined result is computed.'),
    members: group.members.map(index => { const v = variation(index); return {id: visuals[index].id, configuration: bi(`Ωm = ${v.prior}, · z: ${v.band} · ${visuals[index].plot.series[0].label['pt-BR']}`, `Ωm = ${v.prior.replace(/,/g, '.')}, · z: ${v.band.replace(/,/g, '.')} · ${visuals[index].plot.series[0].label.en}`)}; }),
  }));

  const payload = {contract: 'ATLAS_PUBLIC_V1', items: [], links: [], tests, visuals, visualsContract: 'ATLAS_PUBLIC_VISUALS_V1'};
  return {notice: SYNTHETIC_STUDY_NOTICE, payload, catalogs: {questionCatalog, questionAliases: {}, studyRoutes: {[`question-${STUDY_KEY}`]: STUDY_ROUTE, [`question-${SINGLE_STUDY_KEY}`]: SINGLE_STUDY_ROUTE}, campaignCatalog}, comparisonSpec};
}
