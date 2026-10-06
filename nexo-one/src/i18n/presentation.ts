// Editorial public presentation only. No private records, published measurements or inferred results.
import type {Locale} from '../atlas/api.ts';

export const CONTACT_EMAIL = 'phys@denerpereira.com.br';
export type ResearchLine = {id: 'expansion' | 'structure' | 'components'; title: string; body: string};
export type Presentation = {
  hero: {eyebrow: string; title: [string, string]; research: string; methods: string};
  lines: {label: string; title: string; items: ResearchLine[]};
  works: {label: string; title: string};
  methods: {label: string; title: string; lead: string; steps: {title: string; body: string}[]};
  test: {question: string; answers: string; method: string; result: string};
  contact: {label: string; title: string; body: string; action: string};
  footer: {note: string; sections: string};
  nav: {lines: string; works: string; methods: string; contact: string; menu: string; close: string};
};

export const PRESENTATION: Record<Locale, Presentation> = {
  'pt-BR': {
    hero: {eyebrow: 'Pesquisa independente em cosmologia', title: ['Cosmologia', 'computacional.'], research: 'Ver pesquisas', methods: 'Ver métodos'},
    lines: {
      label: 'Pesquisa', title: 'Linhas de pesquisa',
      items: [
        {id: 'expansion', title: 'Supernovas e expansão', body: 'Medidas de distância com supernovas ajudam a estudar a história da expansão do Universo.'},
        {id: 'structure', title: 'Estrutura em grande escala', body: 'Distribuição da matéria em grandes escalas e formação de filamentos, aglomerados e vazios.'},
        {id: 'components', title: 'Modelos cosmológicos', body: 'Comparação das previsões de diferentes modelos com os dados disponíveis.'},
      ],
    },
    methods: {
      label: 'Método', title: 'Como a pesquisa é feita',
      lead: 'Simulações e análise estatística para avaliar como os modelos se ajustam aos dados.',
      steps: [
        {title: 'Dados', body: 'Observações escolhidas conforme a questão que está sendo estudada.'},
        {title: 'Cálculos', body: 'CAMB para calcular previsões dos modelos cosmológicos.'},
        {title: 'Ajuste', body: 'Amostragem MCMC para estimar parâmetros a partir dos dados.'},
        {title: 'Limites', body: 'Avaliação das incertezas e das hipóteses adotadas em cada modelo.'},
      ],
    },
    works: {label: 'Trabalhos', title: 'Trabalhos'},
    test: {question: 'Pergunta', answers: 'O que o teste responde', method: 'Método', result: 'Resultado'},
    contact: {label: 'Contato', title: 'Contato', body: 'Para perguntas sobre a pesquisa ou propostas de colaboração.', action: 'Escrever para'},
    footer: {note: 'Cosmologia computacional', sections: 'Seções'},
    nav: {lines: 'Pesquisa', works: 'Trabalhos', methods: 'Métodos', contact: 'Contato', menu: 'Menu', close: 'Fechar menu'},
  },
  en: {
    hero: {eyebrow: 'Independent research in cosmology', title: ['Computational', 'cosmology.'], research: 'View research', methods: 'View methods'},
    lines: {
      label: 'Research', title: 'Research areas',
      items: [
        {id: 'expansion', title: 'Supernovae and expansion', body: 'Distance measurements from supernovae help study the Universe’s expansion history.'},
        {id: 'structure', title: 'Large-scale structure', body: 'The distribution of matter on large scales and the formation of filaments, clusters and voids.'},
        {id: 'components', title: 'Cosmological models', body: 'Comparing predictions from different models with the available data.'},
      ],
    },
    methods: {
      label: 'Method', title: 'Research methods',
      lead: 'Simulations and statistical analysis to assess how well models fit the data.',
      steps: [
        {title: 'Data', body: 'Observations selected for the question being studied.'},
        {title: 'Calculations', body: 'CAMB calculates predictions from cosmological models.'},
        {title: 'Parameter estimation', body: 'MCMC sampling estimates model parameters from the data.'},
        {title: 'Limitations', body: 'Assessing uncertainties and the assumptions made in each model.'},
      ],
    },
    works: {label: 'Work', title: 'Work'},
    test: {question: 'Question', answers: 'What the test answers', method: 'Method', result: 'Result'},
    contact: {label: 'Contact', title: 'Contact', body: 'For questions about the research or proposals for collaboration.', action: 'Write to'},
    footer: {note: 'Computational cosmology', sections: 'Sections'},
    nav: {lines: 'Research', works: 'Work', methods: 'Methods', contact: 'Contact', menu: 'Menu', close: 'Close menu'},
  },
};
