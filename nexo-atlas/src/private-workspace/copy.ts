import type {Lang} from '../i18n/state-language.ts';
import type {Coverage} from './model.ts';
import {canonicalDomain} from '../shared/domain-identity.mjs';

// Every sentence here is interface wording. Nothing in this file describes research content:
// names, questions, results, reasons and dates always come from the reading itself.
const pt = {
  detailLoading: 'Carregando o registro completo deste teste…', detailUnavailable: 'Não foi possível ler o registro completo. Tente novamente.', detailStale: 'A Tower mudou desde esta leitura. Atualize antes de abrir o registro completo.',
  boardTitle: 'Mural dos agentes', boardLead: 'Mensagens e respostas registradas pelos agentes. Coordenação não é evidência científica.',
  boardMessages: 'mensagens na fonte', boardAsOf: 'situação na leitura de', boardAgent: 'Agente', boardAllAgents: 'Todos os agentes',
  boardNote: 'Anotação própria', boardOpen: 'Aberto', boardAnswered: 'Respondido', boardResolved: 'Resolvido', boardExpired: 'Expirado', boardTo: 'para',
  boardReplyTo: 'Em resposta a', boardRefs: 'Referências registradas', boardConversation: 'Ver conversa', boardRevision: 'Revisão da fonte', boardExpires: 'Expira em',
  boardEmpty: 'O mural está vazio nesta leitura.', boardUnavailable: 'O mural canônico não está disponível nesta leitura.', boardPartial: 'Algumas mensagens não têm os campos necessários para exibição; os registros válidos continuam disponíveis.',
  domainSurface: 'Superfície registrada:',
  // shell
  private: 'Área privada', skip: 'Ir para o conteúdo', web: 'Conhecimento', domains: 'Domínios', tests: 'Testes', operations: 'Operação', memory: 'Memória', board: 'Mural',
  returnWeb: 'Voltar ao conhecimento', decisionFlow: 'Abrir o fluxo de decisões',
  loading: 'Carregando a visão…', sourceAt: 'Leitura de', sourceUnknown: 'A leitura não informa quando foi gerada.',
  reload: 'Atualizar leitura', refreshing: 'Atualizando…', refreshed: 'Leitura verificada.', refreshError: 'Não foi possível atualizar a leitura.',
  unavailable: 'Não foi possível abrir esta visão com a leitura atual.', tryAgain: 'Tentar de novo', missing: 'Esta visão não foi encontrada.',
  partial: 'Esta leitura está incompleta. As listas mostram apenas os registros disponíveis.', collectionUnavailable: 'Esta coleção não está disponível na leitura atual.',
  unknown: 'Não registrado nesta leitura.', clipped: 'Conteúdo abreviado nesta visão. O registro completo está na fonte.',
  yes: 'Sim', no: 'Não', notRecorded: 'não registrado',
  derived: 'Contagens derivadas dos registros desta leitura. Elas descrevem o que foi lido, não um resultado científico.',
  countUnavailable: 'não disponível', atLeast: 'ao menos',
  // domains
  domainsLead: 'Um domínio é uma área de pesquisa ou de atividade. Abra um deles para ver como se organiza e o que cada teste perguntou.',
  domainsEmpty: 'Nenhum domínio foi registrado nesta leitura.', allDomains: 'Todos os domínios',
  openDomain: 'Abrir domínio', domainState: 'Situação registrada', domainNext: 'Próximo passo registrado', domainBlockers: 'Impedimentos registrados',
  structure: 'Como este domínio se organiza', structureLead: 'Subdomínios e tópicos classificam os testes. Campanhas reúnem testes em torno de uma pergunta. Hipóteses são as afirmações que os testes põem à prova.',
  subdomains: 'Subdomínios', topics: 'Tópicos', campaigns: 'Campanhas', hypotheses: 'Hipóteses', unnamedSubdomain: 'Subdomínio sem nome registrado', unnamedTopic: 'Tópico sem nome registrado',
  noSubdomain: 'sem subdomínio registrado', noStructure: 'A leitura não registra subdomínios, campanhas ou hipóteses para este domínio.',
  campaignWhy: 'Por que importa', untitledCampaign: 'Campanha sem título registrado', hypothesisUnstated: 'O enunciado desta hipótese não foi registrado nesta leitura.',
  one: {test: 'teste', result: 'com resultado', pending: 'com pendência', subdomain: 'subdomínio', campaign: 'campanha', hypothesis: 'hipótese', topic: 'tópico'},
  many: {test: 'testes', result: 'com resultado', pending: 'com pendências', subdomain: 'subdomínios', campaign: 'campanhas', hypothesis: 'hipóteses', topic: 'tópicos'},
  // research list
  all: 'Todos', results: 'Com resultado', pending: 'Com pendências',
  researchLead: 'Um mesmo teste pode ter resultado e pendência ao mesmo tempo, por exemplo quando o resultado ainda aguarda revisão.',
  search: 'Buscar teste', searchPlaceholder: 'Pergunta, nome, campanha ou identificador', none: 'Nenhum teste neste filtro.', noneQuery: 'Nenhum teste corresponde a esta busca.',
  showing: 'Mostrando', of: 'de', more: 'Mostrar mais', openTest: 'Abrir teste', campaign: 'Campanha', filterBy: 'Filtrar testes',
  // test detail
  question: 'Pergunta', noQuestion: 'A pergunta deste teste não foi registrada nesta leitura.',
  answer: 'Resposta', meaning: 'O que o resultado diz', noResult: 'O resultado ainda não foi registrado nesta leitura.', noMeaning: 'A interpretação do resultado não foi registrada nesta leitura.',
  standing: 'Em que pé está', standingNote: 'Frase derivada dos estados registrados abaixo. Ela resume a leitura e não substitui a revisão.',
  values: 'Valores registrados', statistics: 'Estatísticas',
  limits: 'Limites', limitations: 'Limitações registradas', claimBoundary: 'Até onde a afirmação vai', claimLevel: 'Nível da afirmação', noLimits: 'Nenhum limite foi registrado para este teste nesta leitura.',
  relations: 'Onde este teste se encaixa', noRelations: 'A leitura não registra relações para este teste.',
  hypothesis: 'Hipótese', roadmap: 'Roteiro', dependsOn: 'Depende de', requiredBy: 'É base para', contestOf: 'Contesta', contestedBy: 'Contestado por',
  otherLinks: 'Outras ligações registradas', absentLink: 'não está nesta leitura',
  execution: 'Execução', executionLead: 'O que aconteceu ao rodar o teste. Terminar a execução não é uma confirmação.',
  review: 'Revisão', reviewLead: 'O que a revisão independente concluiu sobre o resultado.',
  createdAt: 'Registrado em', executedAt: 'Executado em', runner: 'Executor', battery: 'Bateria', runRef: 'Registro da execução',
  readiness: 'Elegibilidade', eligible: 'Elegível na verificação registrada', ineligible: 'Inelegível na verificação registrada', blocker: 'Impedimento',
  reviewSteps: 'Etapas da revisão', noReviewSteps: 'Nenhuma etapa de revisão foi registrada nesta leitura.', reviewBy: 'por', reviewAxis: 'eixo',
  robustness: 'Verificações de robustez',
  data: 'Dados', datasets: 'Dados usados', artifacts: 'Artefatos',
  method: 'Método e critérios', methodText: 'Método', prereg: 'Critérios registrados antes da execução', recipe: 'Receita registrada', recipeRef: 'Referência da receita',
  unavailableRecipe: 'A receita não foi registrada nesta leitura.',
  technical: 'Detalhe técnico', id: 'Identificador', source: 'Fonte', status: 'Estado registrado', reviewCode: 'Revisão registrada', verdictCode: 'Veredito registrado', raw: 'Registro como veio da fonte',
  noTest: 'Este teste não está presente na leitura atual.', back: 'Voltar aos testes', original: 'Abrir a visão anterior deste teste',
  // operations
  operationsLead: 'O que está em andamento e o que depende de você, como a fonte registrou. Esta visão só mostra: decidir e executar continuam nos fluxos existentes.',
  human: 'Precisam de você', running: 'Em execução', blocked: 'Bloqueados', waiting: 'Aguardando',
  emptyOperation: 'Nenhum item neste grupo na leitura atual.', operationEmpty: 'Nenhuma pendência operacional foi registrada nesta leitura.',
  decision: 'O que precisa ser decidido', options: 'Opções registradas', consequence: 'Consequência', reason: 'Motivo', next: 'Próximo passo',
  humanNeeds: 'Depende de você', automaticNeeds: 'Depende do sistema', dueAt: 'Prazo', since: 'Desde', where: 'Onde agir',
  byDomain: 'Situação por domínio', sideQuests: 'Tarefas paralelas', viewOnly: 'Somente leitura. Nenhuma opção é enviada a partir desta página.',
  // memory (reserved presentation point)
  memoryTitle: 'Memória', memoryOff: 'A memória ainda não está conectada a este site.',
  memoryLead: 'Quando for integrada, esta área permitirá consultar registros e sua origem, com busca por texto. Anotações serão rascunhos desta sessão, sem gravação.',
  memoryLimits: ['Consulta somente leitura.', 'Busca por texto. A busca por semelhança não está conectada.', 'Nenhuma gravação é feita a partir do site.'],
  recordedEntities: 'registros únicos na fonte', childOf: 'Parte de', sameDomain: 'Nomes do mesmo domínio:', directTests: 'diretos', linkedTests: 'por vínculos semânticos explícitos', uniqueDomainCounts: 'Cada teste é contado uma vez neste domínio; o total do domínio pai inclui seus subdomínios.', retiredIncluded: 'arquivados ou retirados incluídos no total', cosmology: 'Cosmologia', astrophysics: 'Astrofísica', physics: 'Física', personal: 'Pessoal', health: 'Saúde', bodybuilding: 'Fisiculturismo', artifact: 'Artefatos', ai: 'Inteligência artificial', unmapped: 'Sem domínio registrado',
  science: 'Ciência', engineering: 'Engenharia', olympus: 'Olympus',
};
export type WorkspaceCopy = typeof pt;
const en: WorkspaceCopy = {
  detailLoading: 'Loading the complete test record…', detailUnavailable: 'The complete record could not be read. Try again.', detailStale: 'Tower changed since this reading. Refresh before opening the complete record.',
  boardTitle: 'Agent board', boardLead: 'Messages and replies recorded by the agents. Coordination is not scientific evidence.',
  boardMessages: 'source messages', boardAsOf: 'status as of', boardAgent: 'Agent', boardAllAgents: 'All agents',
  boardNote: 'Self note', boardOpen: 'Open', boardAnswered: 'Answered', boardResolved: 'Resolved', boardExpired: 'Expired', boardTo: 'to',
  boardReplyTo: 'In reply to', boardRefs: 'Recorded references', boardConversation: 'View conversation', boardRevision: 'Source revision', boardExpires: 'Expires at',
  boardEmpty: 'The board is empty in this reading.', boardUnavailable: 'The canonical board is unavailable in this reading.', boardPartial: 'Some messages lack fields needed for display; valid records remain available.',
  domainSurface: 'Recorded surface:',

  private: 'Private area', skip: 'Skip to content', web: 'Knowledge', domains: 'Domains', tests: 'Tests', operations: 'Operations', memory: 'Memory', board: 'Board',
  returnWeb: 'Back to knowledge', decisionFlow: 'Open the decision workflow',
  loading: 'Loading the view…', sourceAt: 'Snapshot from', sourceUnknown: 'The snapshot does not say when it was generated.',
  reload: 'Refresh snapshot', refreshing: 'Refreshing…', refreshed: 'Snapshot verified.', refreshError: 'The snapshot could not be refreshed.',
  unavailable: 'This view could not be opened with the current snapshot.', tryAgain: 'Try again', missing: 'This view was not found.',
  partial: 'This snapshot is incomplete. Lists show only the available records.', collectionUnavailable: 'This collection is unavailable in the current snapshot.',
  unknown: 'Not recorded in this snapshot.', clipped: 'Content shortened in this view. The full record is in the source.',
  yes: 'Yes', no: 'No', notRecorded: 'not recorded',
  derived: 'Counts derived from the records in this snapshot. They describe what was read, not a scientific result.',
  countUnavailable: 'unavailable', atLeast: 'at least',
  domainsLead: 'A domain is an area of research or activity. Open one to see how it is organised and what each test asked.',
  domainsEmpty: 'No domain was recorded in this snapshot.', allDomains: 'All domains',
  openDomain: 'Open domain', domainState: 'Recorded situation', domainNext: 'Recorded next step', domainBlockers: 'Recorded blockers',
  structure: 'How this domain is organised', structureLead: 'Subdomains and topics classify the tests. Campaigns gather tests around one question. Hypotheses are the statements the tests put to the proof.',
  subdomains: 'Subdomains', topics: 'Topics', campaigns: 'Campaigns', hypotheses: 'Hypotheses', unnamedSubdomain: 'Subdomain with no recorded name', unnamedTopic: 'Topic with no recorded name',
  noSubdomain: 'no subdomain recorded', noStructure: 'The snapshot records no subdomains, campaigns or hypotheses for this domain.',
  campaignWhy: 'Why it matters', untitledCampaign: 'Campaign with no recorded title', hypothesisUnstated: 'The statement of this hypothesis was not recorded in this snapshot.',
  one: {test: 'test', result: 'with a result', pending: 'with pending work', subdomain: 'subdomain', campaign: 'campaign', hypothesis: 'hypothesis', topic: 'topic'},
  many: {test: 'tests', result: 'with a result', pending: 'with pending work', subdomain: 'subdomains', campaign: 'campaigns', hypothesis: 'hypotheses', topic: 'topics'},
  all: 'All', results: 'With results', pending: 'With pending work',
  researchLead: 'A test can have a result and pending work at the same time, for example when the result is still waiting for review.',
  search: 'Find a test', searchPlaceholder: 'Question, name, campaign or identifier', none: 'No tests in this filter.', noneQuery: 'No tests match this search.',
  showing: 'Showing', of: 'of', more: 'Show more', openTest: 'Open test', campaign: 'Campaign', filterBy: 'Filter tests',
  question: 'Question', noQuestion: 'The question of this test was not recorded in this snapshot.',
  answer: 'Answer', meaning: 'What the result says', noResult: 'The result has not been recorded in this snapshot.', noMeaning: 'An interpretation of the result was not recorded in this snapshot.',
  standing: 'Where it stands', standingNote: 'Sentence derived from the recorded states below. It summarises the snapshot and does not replace the review.',
  values: 'Recorded values', statistics: 'Statistics',
  limits: 'Limits', limitations: 'Recorded limitations', claimBoundary: 'How far the claim goes', claimLevel: 'Claim level', noLimits: 'No limits were recorded for this test in this snapshot.',
  relations: 'Where this test fits', noRelations: 'The snapshot records no relations for this test.',
  hypothesis: 'Hypothesis', roadmap: 'Roadmap', dependsOn: 'Depends on', requiredBy: 'Is the basis for', contestOf: 'Contests', contestedBy: 'Contested by',
  otherLinks: 'Other recorded links', absentLink: 'not in this snapshot',
  execution: 'Execution', executionLead: 'What happened when the test ran. A finished run is not a confirmation.',
  review: 'Review', reviewLead: 'What the independent review concluded about the result.',
  createdAt: 'Recorded on', executedAt: 'Run on', runner: 'Runner', battery: 'Battery', runRef: 'Run record',
  readiness: 'Eligibility', eligible: 'Eligible in the recorded check', ineligible: 'Not eligible in the recorded check', blocker: 'Blocker',
  reviewSteps: 'Review steps', noReviewSteps: 'No review step was recorded in this snapshot.', reviewBy: 'by', reviewAxis: 'axis',
  robustness: 'Robustness checks',
  data: 'Data', datasets: 'Data used', artifacts: 'Artifacts',
  method: 'Method and criteria', methodText: 'Method', prereg: 'Criteria recorded before the run', recipe: 'Recorded recipe', recipeRef: 'Recipe reference',
  unavailableRecipe: 'The recipe was not recorded in this snapshot.',
  technical: 'Technical detail', id: 'Identifier', source: 'Source', status: 'Recorded state', reviewCode: 'Recorded review', verdictCode: 'Recorded verdict', raw: 'Record as it came from the source',
  noTest: 'This test is not present in the current snapshot.', back: 'Back to tests', original: 'Open the previous view of this test',
  operationsLead: 'What is in progress and what depends on you, as the source recorded it. This view only shows: deciding and running stay in the existing workflows.',
  human: 'Need you', running: 'Running', blocked: 'Blocked', waiting: 'Waiting',
  emptyOperation: 'No items in this group in the current snapshot.', operationEmpty: 'No operational work is pending in this snapshot.',
  decision: 'What needs to be decided', options: 'Recorded options', consequence: 'Consequence', reason: 'Reason', next: 'Next step',
  humanNeeds: 'Depends on you', automaticNeeds: 'Depends on the system', dueAt: 'Due', since: 'Since', where: 'Where to act',
  byDomain: 'Situation by domain', sideQuests: 'Side tasks', viewOnly: 'Read only. No option is sent from this page.',
  memoryTitle: 'Memory', memoryOff: 'Memory is not connected to this site yet.',
  memoryLead: 'Once integrated, this area will let you browse records and where they come from, with text search. Annotations will be drafts of this session, never saved.',
  memoryLimits: ['Read-only browsing.', 'Text search. Similarity search is not connected.', 'Nothing is written from the site.'],
  recordedEntities: 'unique source records', childOf: 'Part of', sameDomain: 'Names for this domain:', directTests: 'direct', linkedTests: 'through explicit semantic links', uniqueDomainCounts: 'Each test is counted once in this domain; parent totals include their subdomains.', retiredIncluded: 'archived or retired records included in the total', cosmology: 'Cosmology', astrophysics: 'Astrophysics', physics: 'Physics', personal: 'Personal', health: 'Health', bodybuilding: 'Bodybuilding', artifact: 'Artifacts', ai: 'Artificial intelligence', unmapped: 'No recorded domain',
  science: 'Science', engineering: 'Engineering', olympus: 'Olympus',
};
export const WORKSPACE_COPY: Record<Lang, WorkspaceCopy> = {'pt-BR': pt, en};
export function domainName(domain: string, lang: Lang) { const m = WORKSPACE_COPY[lang]; return ({SCIENCE: m.science, COSMOLOGY: m.cosmology, ASTROPHYSICS: m.astrophysics, PHYSICS: m.physics, ENGINEERING: m.engineering, OLYMPUS: m.olympus, PERSONAL:m.personal, HEALTH:m.health, BODYBUILDING:m.bodybuilding, ARTIFACT:m.artifact, AI:m.ai, UNMAPPED:m.unmapped} as Record<string, string>)[canonicalDomain(domain)] ?? domain; }

type Noun = keyof WorkspaceCopy['one'];
/** "3 testes", "1 test"; under partial coverage "ao menos 3 testes"; an unavailable collection is never shown as zero. */
export function countPhrase(n: number, noun: Noun, lang: Lang, coverage: Coverage = 'complete'): string {
  const m = WORKSPACE_COPY[lang], word = (n === 1 ? m.one : m.many)[noun];
  if (coverage === 'unavailable') return `${m.many[noun]}: ${m.countUnavailable}`;
  return `${coverage === 'partial' ? `${m.atLeast} ` : ''}${n} ${word}`;
}

// Field names of structured records that have an everyday name. Any other key is shown exactly as the source wrote it.
const KEYS: Record<Lang, Record<string, string>> = {
  'pt-BR': {metric: 'Métrica', threshold: 'Limiar', prediction: 'Previsão', null: 'Modelo nulo', null_model: 'Modelo nulo', rival: 'Hipótese rival', success: 'Critérios de sucesso', kill: 'Critérios de descarte', hash: 'Hash do registro', at: 'Data', ref: 'Referência', name: 'Nome', id: 'Identificador', path: 'Caminho', url: 'Endereço', kind: 'Tipo', outcome: 'Desfecho', by: 'Por', axis: 'Eixo', value: 'Valor', unit: 'Unidade', description: 'Descrição', source: 'Fonte', version: 'Versão', runner: 'Executor', battery_id: 'Bateria', run_ref: 'Registro da execução', note: 'Observação', notes: 'Observações', label: 'Nome', title: 'Título', status: 'Estado', result: 'Resultado', reason: 'Motivo'},
  en: {metric: 'Metric', threshold: 'Threshold', prediction: 'Prediction', null: 'Null model', null_model: 'Null model', rival: 'Rival hypothesis', success: 'Success criteria', kill: 'Discard criteria', hash: 'Record hash', at: 'Date', ref: 'Reference', name: 'Name', id: 'Identifier', path: 'Path', url: 'Address', kind: 'Kind', outcome: 'Outcome', by: 'By', axis: 'Axis', value: 'Value', unit: 'Unit', description: 'Description', source: 'Source', version: 'Version', runner: 'Runner', battery_id: 'Battery', run_ref: 'Run record', note: 'Note', notes: 'Notes', label: 'Name', title: 'Title', status: 'State', result: 'Result', reason: 'Reason'},
};
export const keyLabel = (key: string, lang: Lang): {label: string; known: boolean} => { const label = KEYS[lang][key]; return label ? {label, known: true} : {label: key, known: false}; };

// Relation kinds of the graph contract, said as a phrase. An unknown kind is shown as published.
const RELATION: Record<Lang, Record<string, [string, string]>> = {
  'pt-BR': {OWNS: ['contém', 'pertence a'], PRODUCES: ['produz', 'é produzido por'], VERIFIES: ['verifica', 'é verificado por'], DEPENDS_ON: ['depende de', 'é base para'], PROJECTS: ['projeta', 'é projetado por'], CONTRADICTS: ['contradiz', 'é contradito por'], SUPPORTS: ['apoia', 'é apoiado por'], ROUTES_TO: ['encaminha para', 'recebe de'], BLOCKS: ['bloqueia', 'é bloqueado por'], DERIVES_FROM: ['deriva de', 'dá origem a']},
  en: {OWNS: ['contains', 'belongs to'], PRODUCES: ['produces', 'is produced by'], VERIFIES: ['verifies', 'is verified by'], DEPENDS_ON: ['depends on', 'is the basis for'], PROJECTS: ['projects', 'is projected by'], CONTRADICTS: ['contradicts', 'is contradicted by'], SUPPORTS: ['supports', 'is supported by'], ROUTES_TO: ['routes to', 'receives from'], BLOCKS: ['blocks', 'is blocked by'], DERIVES_FROM: ['derives from', 'gives rise to']},
};
export const relationPhrase = (kind: string, direction: 'out' | 'in', lang: Lang): string => RELATION[lang][kind]?.[direction === 'out' ? 0 : 1] ?? kind;

// Operational states of the action / work contract that the shared state formatter does not cover. Anything else is shown as published.
const OPERATION_STATE: Record<Lang, Record<string, string>> = {
  'pt-BR': {AWAITING_HUMAN: 'Aguardando você', WAIT_DEPENDENCY: 'Aguardando uma dependência', WAITING_SIDE_QUEST: 'Aguardando uma tarefa paralela', WAITING: 'Aguardando', OPEN: 'aberta'},
  en: {AWAITING_HUMAN: 'Waiting for you', WAIT_DEPENDENCY: 'Waiting for a dependency', WAITING_SIDE_QUEST: 'Waiting for a side task', WAITING: 'Waiting', OPEN: 'open'},
};
export const operationStateLabel = (code: string, lang: Lang): string | null => OPERATION_STATE[lang][code] ?? null;
