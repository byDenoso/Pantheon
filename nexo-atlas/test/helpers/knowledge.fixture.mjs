// Synthetic knowledge graph for UI tests and the local preview. Not real science.
export function knowledgeReadModel() {
  const campaigns = {
    'SYN-Q-EXP': {campaign_id: 'SYN-Q-EXP', central_question: 'Pergunta sintética A: a expansão tardia desvia do modelo base?', roadmap_id: 'R1'},
    'SYN-Q-GROW': {campaign_id: 'SYN-Q-GROW', central_question: 'Pergunta sintética B: o crescimento de estrutura é menor em z baixo?', roadmap_id: 'R1'},
    'SYN-Q-H0': {campaign_id: 'SYN-Q-H0', central_question: 'Pergunta sintética C: a discrepância local é sistemática?', roadmap_id: 'R2'},
  };
  const h = (id, q, label, status, roadmap) => [id, {hypothesis_id: id, question_id: q, proposition: label, status, roadmap_id: roadmap}];
  const hypotheses = Object.fromEntries([
    h('SYN-H1', 'SYN-Q-EXP', 'Hipótese sintética 1: desvio físico', 'ACTIVE', 'R1'),
    h('SYN-H2', 'SYN-Q-EXP', 'Hipótese sintética 2: calibração', 'ACTIVE', 'R1'),
    h('SYN-H3', 'SYN-Q-GROW', 'Hipótese sintética 3: crescimento suprimido', 'INCONCLUSIVE', 'R1'),
    h('SYN-H4', 'SYN-Q-GROW', 'Hipótese sintética 4: viés de photo-z', 'PARKED', 'R1'),
    h('SYN-H5', 'SYN-Q-H0', 'Hipótese sintética 5: sistemática da escada', 'PROMOTED', 'R2'),
    h('SYN-H6', 'SYN-Q-H0', 'Hipótese sintética 6: física nova', 'KILLED', 'R2'),
  ]);
  const claims = {};
  const c = (id, o) => { claims[id] = {claim_id: id, ...o}; };
  const tiers = ['A', 'A', 'B', 'C'], types = ['COLLABORATION', 'INDEPENDENT', 'REANALYSIS', 'THEORY'];
  let n = 0;
  for (const [hyp, pro, con] of [['SYN-H1', 4, 2], ['SYN-H2', 3, 3], ['SYN-H3', 2, 1], ['SYN-H4', 1, 1], ['SYN-H5', 5, 1], ['SYN-H6', 1, 4]]) {
    for (let i = 0; i < pro + con; i++) {
      n++;
      c(`SYN-LIT-${n}`, {source: 'LITERATURE', label: `Artigo sintético ${n}`, ref: `synthetic:${n}`, journal: `Revista sintética ${tiers[n % 4]}`, journal_tier: tiers[n % 4],
        evidence_type: types[n % 4], publication_status: n % 5 ? 'PEER_REVIEWED' : 'PREPRINT', data_lineage: [`dataset-${n % 3}`],
        date: `2026-0${(n % 9) + 1}-15`, value: `valor sintético ${n}`, [i < pro ? 'supports' : 'contradicts']: [hyp]});
    }
  }
  c('SYN-NEXO-1', {source: 'NEXO', label: 'Teste NEXO sintético 1', review_verdict: 'SURVIVED', data_lineage: ['dataset-9'], date: '2026-10-10', supports: ['SYN-H1']});
  c('SYN-NEXO-2', {source: 'NEXO', label: 'Teste NEXO sintético 2', data_lineage: ['dataset-1'], date: '2026-10-12', contradicts: ['SYN-H3']});
  c('SYN-NEXO-3', {source: 'NEXO', label: 'Teste NEXO sintético 3', review_verdict: 'SURVIVED', data_lineage: ['dataset-8'], date: '2026-10-14', supports: ['SYN-H5']});
  return {campaigns, hypotheses, claims};
}

// Stress shape of the real data: 26 questions (4 big, 21 tiny (9 with one hypothesis, 12 empty), one unassigned with 70 hypotheses), 109 hypotheses, 630 claims.
// Deterministic (LCG), synthetic, long Portuguese labels in the unassigned group.
export function knowledgeStressReadModel() {
  let seed = 20260929;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const campaigns = {}, hypotheses = {}, claims = {}, tests = {};
  const addQ = (id, label, roadmap) => { campaigns[id] = {campaign_id: id, central_question: label, roadmap_id: roadmap}; };
  const big = [
    ['SYN-Q-EXP', 'Pergunta sintética A: a expansão tardia desvia do modelo base dentro das incertezas combinadas?', 'R1', 10],
    ['SYN-Q-GROW', 'Pergunta sintética B: o crescimento de estrutura é menor em redshift baixo?', 'R1', 8],
    ['SYN-Q-H0', 'Pergunta sintética C: a discrepância local da constante de Hubble é sistemática?', 'R2', 7],
    ['SYN-Q-ANISO', 'Pergunta sintética D: existe anisotropia residual no fluxo de matéria local?', 'R2', 5],
  ];
  const status = ['ACTIVE', 'ACTIVE', 'PROMOTED', 'INCONCLUSIVE', 'PARKED', 'KILLED', 'CANDIDATE'];
  let n = 0;
  const addH = (q, roadmap, label, st) => { n++; const id = q === 'Q-UNASSIGNED' ? `HYP-T-DE-ANISO-SRS26-${String(n).padStart(3, '0')}` : `SYN-H${n}`;
    hypotheses[id] = {hypothesis_id: id, question_id: q, proposition: label, status: st, roadmap_id: roadmap}; return id; };
  for (const [q, label, rm, size] of big) { addQ(q, label, rm); for (let i = 0; i < size; i++) addH(q, rm, `Hipótese sintética ${n + 1}: ${pick(['desvio físico', 'calibração', 'viés de seleção', 'sistemática instrumental', 'física nova', 'degenerescência de parâmetros'])} no regime ${i + 1}`, pick(status)); }
  for (let t = 0; t < 21; t++) { const q = `SYN-Q-T${t + 1}`; addQ(q, `Pergunta sintética menor ${t + 1}`, t % 2 ? 'R3' : 'R2'); for (let i = 0; i < (t < 9 ? 1 : 0); i++) addH(q, 'R3', `Hipótese menor ${n + 1}`, pick(status)); }
  addQ('Q-UNASSIGNED', 'Q-UNASSIGNED', null);
  const topics = ['dipolo de aceleração', 'anisotropia da escala de calibração', 'ruído de lente fraca', 'covariância entre sondas independentes', 'viés de magnitude de Malmquist', 'tensão entre amostras de baixo redshift', 'modulação angular do parâmetro de desaceleração'];
  for (let i = 0; i < 70; i++) addH('Q-UNASSIGNED', null, `Se o ${pick(topics)} permanece após marginalizar a calibração local e a seleção da amostra, então o efeito de ${pick(topics)} não é artefato do estimador no conjunto SRS26 (variante ${i + 1})`, pick(status));
  const hyps = Object.keys(hypotheses);
  const skew = () => hyps[Math.floor(Math.pow(rnd(), 1.7) * hyps.length)];
  const tiers = ['A', 'A', 'B', 'C'], types = ['COLLABORATION', 'INDEPENDENT', 'REANALYSIS', 'THEORY'];
  for (let i = 1; i <= 160; i++) {
    const h = skew(), side = rnd() < 0.6 ? 'supports' : 'contradicts';
    claims[`SYN-LIT-${i}`] = {claim_id: `SYN-LIT-${i}`, source: 'LITERATURE', label: `Artigo sintético ${i}`, ref: `synthetic:${i}`, journal: `Revista sintética ${tiers[i % 4]}`, journal_tier: tiers[i % 4],
      evidence_type: types[i % 4], publication_status: i % 5 ? 'PEER_REVIEWED' : 'PREPRINT', data_lineage: [`dataset-${i % 7}`], date: `2026-0${(i % 9) + 1}-15`, value: `valor sintético ${i}`,
      [side]: rnd() < 0.15 ? [h, skew()] : [h]};
  }
  const verdicts = ['SURVIVED', 'SUPPORTED', 'REFUTED', 'NULL'];
  for (let i = 1; i <= 470; i++) tests[`T${i}`] = {id: `T${i}`, hypothesis_id: skew(), verdict: pick(verdicts), review_state: rnd() < 0.5 ? 'SURVIVED' : '', display_name: `Teste NEXO sintético ${i}`,
    datasets: [{name: `dataset-${i % 5}`, version: '1'}], executed_at: `2026-${String((i % 9) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`};
  return {campaigns, hypotheses, claims, tests};
}
