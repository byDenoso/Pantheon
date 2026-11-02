// Plain-language glossary for the "from scratch" reading level. Each entry
// explains what a term is; none states a result. Pure module, no DOM.
import type {Locale} from './api.ts';

type Entry = {id: string; match: Record<Locale, RegExp>; definition: Record<Locale, string>};
const term = (id: string, pt: RegExp, en: RegExp, defPt: string, defEn: string): Entry => ({id, match: {'pt-BR': pt, en}, definition: {'pt-BR': defPt, en: defEn}});

export const GLOSSARY: readonly Entry[] = [
  term('redshift', /\bredshift\b|(?<![\p{L}\p{N}])z(?= =|=| \()/u, /\bredshift\b|(?<![\p{L}\p{N}])z(?= =|=| \()/u,
    'Redshift (z): quanto a luz de um objeto foi esticada pela expansão do Universo. Quanto maior, mais distante e mais antigo é o que vemos.',
    'Redshift (z): how much an object’s light has been stretched by the expansion of the Universe. The larger it is, the farther and older what we see.'),
  term('supernova', /\bsupernovas?\b/iu, /\bsupernovae?\b/iu,
    'Explosões de estrelas com brilho previsível, usadas como marcadores de distância.',
    'Stellar explosions with a predictable brightness, used as distance markers.'),
  term('catalogue', /\bPantheon\+|\bDES-SN5YR\b|\bUnion3\b/u, /\bPantheon\+|\bDES-SN5YR\b|\bUnion3\b/u,
    'Um catálogo de supernovas usado como fonte de dados nesta análise.',
    'A supernova catalogue used as a data source in this analysis.'),
  term('bao', /\bBAO\b/u, /\bBAO\b/u,
    'Oscilações acústicas de bárions: um padrão de tamanho conhecido na distribuição das galáxias, usado como régua para medir distâncias.',
    'Baryon acoustic oscillations: a pattern of known size in the distribution of galaxies, used as a ruler to measure distances.'),
  term('desi', /\bDESI\b/u, /\bDESI\b/u,
    'Levantamento de galáxias que mede o padrão BAO. DR1 e DR2 são versões dos seus dados.',
    'A galaxy survey that measures the BAO pattern. DR1 and DR2 are releases of its data.'),
  term('cmb', /\bCMB\b|radiação cósmica de fundo/u, /\bCMB\b|cosmic microwave background/iu,
    'Radiação cósmica de fundo: a luz mais antiga do Universo, emitida quando ele tinha cerca de 380 mil anos.',
    'Cosmic microwave background: the oldest light in the Universe, emitted when it was about 380,000 years old.'),
  term('omega-m', /Ωm/u, /Ωm/u,
    'Ωm: a fração da energia do Universo que está na forma de matéria, comum e escura.',
    'Ωm: the fraction of the Universe’s energy in the form of matter, ordinary and dark.'),
  term('prior', /\bpriors?\b/iu, /\bpriors?\b/iu,
    'Suposição adotada antes de olhar os dados, como um intervalo plausível para um parâmetro.',
    'An assumption adopted before looking at the data, such as a plausible range for a parameter.'),
  term('chi2', /χ²/u, /χ²/u,
    'χ²: medida de quanto um modelo se afasta dos dados; menor é melhor. A diferença entre dois χ² compara dois modelos.',
    'χ²: a measure of how far a model is from the data; lower is better. The difference between two χ² values compares two models.'),
  term('sigma', /\d\s?σ|\bσ\b/u, /\d\s?σ|\bσ\b/u,
    'σ: unidade de significância estatística. Diz quantos desvios-padrão um resultado está do valor esperado quando não há efeito.',
    'σ: a unit of statistical significance. It says how many standard deviations a result is from the value expected when there is no effect.'),
  term('w0wa', /w₀/u, /w₀/u,
    'w₀ e wₐ: dois números que descrevem a energia escura, hoje (w₀) e como ela muda com o tempo (wₐ). O par (−1, 0) é a energia escura constante.',
    'w₀ and wₐ: two numbers that describe dark energy, today (w₀) and how it changes over time (wₐ). The pair (−1, 0) is constant dark energy.'),
  term('dynamical-de', /energia escura variável/iu, /\b(?:dynamical|evolving|varying|changing) dark energy\b/iu,
    'Hipótese em que a energia escura muda com o tempo, em vez de ser uma constante.',
    'The hypothesis that dark energy changes over time instead of being a constant.'),
  term('lcdm', /ΛCDM/u, /ΛCDM/u,
    'ΛCDM: o modelo padrão da cosmologia, com energia escura constante (Λ) e matéria escura fria (CDM).',
    'ΛCDM: the standard model of cosmology, with constant dark energy (Λ) and cold dark matter (CDM).'),
  term('dark-matter', /matéria escura/iu, /\bdark matter\b/iu,
    'Matéria que não emite luz e só é percebida pela gravidade. Compõe a maior parte da matéria do Universo.',
    'Matter that emits no light and is noticed only through gravity. It makes up most of the matter in the Universe.'),
  term('h0', /H₀|H0\b/u, /H₀|H0\b/u,
    'H₀: a constante de Hubble, a taxa de expansão do Universo hoje.',
    'H₀: the Hubble constant, the expansion rate of the Universe today.'),
  term('s8', /\bS8\b/u, /\bS8\b/u,
    'S8: um número que resume o quanto a matéria está aglomerada em grandes escalas.',
    'S8: a number that summarises how clumped matter is on large scales.'),
  term('bao-scale', /parâmetro de escala BAO|régua acústica/iu, /BAO[- ]scale parameter|acoustic ruler/iu,
    'O número que fixa, na análise, o tamanho da régua BAO usada para medir distâncias.',
    'The number that fixes, in the analysis, the size of the BAO ruler used to measure distances.'),
  term('calibration', /calibraç(?:ão|ões)/iu, /\bcalibrations?\b/iu,
    'Ajuste que converte uma medida bruta em uma grandeza física, como transformar brilho em distância.',
    'The adjustment that turns a raw measurement into a physical quantity, such as turning brightness into distance.'),
  term('tracers', /traçadores/iu, /\btracers\b/iu,
    'Tipos de objetos, como galáxias e quasares, usados para mapear a distribuição da matéria.',
    'Kinds of objects, such as galaxies and quasars, used to map the distribution of matter.'),
  term('growth', /\bcrescimento\b/iu, /\bgrowth\b/iu,
    'Crescimento de estruturas: o ritmo com que a matéria se aglomera ao longo do tempo, formando galáxias e aglomerados.',
    'Growth of structure: the rate at which matter clumps over time, forming galaxies and clusters.'),
  term('fit-improvement', /melhora do ajuste/iu, /\b(?:fit improvement|improvement (?:of|in) the fit)\b/iu,
    'Quanto o modelo alternativo descreve os dados melhor que o modelo de referência.',
    'How much better the alternative model describes the data than the reference model.'),
  term('robustness', /\brobustez\b/iu, /\brobustness\b/iu,
    'Teste que verifica se um resultado se mantém quando uma escolha da análise é alterada.',
    'A test that checks whether a result holds when one choice in the analysis is changed.'),
  term('lyman-alpha', /Lyman-alfa/iu, /Lyman-alpha|Lyman-α/iu,
    'Absorção da luz pelo hidrogênio ao longo do caminho até nós, usada para mapear a matéria em pequenas escalas.',
    'Absorption of light by hydrogen along the way to us, used to map matter on small scales.'),
  term('mcmc', /\bMCMC\b/u, /\bMCMC\b/u,
    'Método computacional que explora as combinações de parâmetros compatíveis com os dados.',
    'A computational method that explores the parameter combinations compatible with the data.'),
  term('bayes', /fator de Bayes/iu, /Bayes factor/iu,
    'Comparação entre dois modelos que pesa quanto cada um explica os dados.',
    'A comparison between two models that weighs how well each explains the data.'),
  term('susy', /supersimetria|supersimétric[ao]/iu, /supersymmetr(?:y|ic)/iu,
    'Supersimetria: uma simetria hipotética que relaciona partículas de matéria e partículas de força.',
    'Supersymmetry: a hypothetical symmetry that relates matter particles and force particles.'),
];

export type Segment = string | {term: string; definition: string};
const MAX_TERMS = 8;

/** Splits a text into plain segments and the first mention of each glossary term. */
export function annotate(text: string, locale: Locale): Segment[] {
  const hits: {start: number; end: number; definition: string}[] = [];
  for (const entry of GLOSSARY) {
    const found = new RegExp(entry.match[locale].source, entry.match[locale].flags.replace('g', '')).exec(text);
    if (!found || found[0].length === 0) continue;
    const start = found.index, end = start + found[0].length;
    if (hits.some(h => start < h.end && end > h.start)) continue;
    hits.push({start, end, definition: entry.definition[locale]});
  }
  hits.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let cursor = 0;
  for (const hit of hits.slice(0, MAX_TERMS)) {
    if (hit.start > cursor) out.push(text.slice(cursor, hit.start));
    out.push({term: text.slice(hit.start, hit.end), definition: hit.definition});
    cursor = hit.end;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}
