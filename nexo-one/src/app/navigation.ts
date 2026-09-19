// Navegação única para NEXO ONE e Atlas.
// O plano SISTEMA consome o SystemState; o plano PESSOAL lê o world state do backend real.
export const SYSTEM_VIEWS = [
  'OVERVIEW', 'INBOX', 'ACTIONS', 'EXECUTION',
  'TRUTHGRAPH', 'CAPABILITIES', 'SOURCES', 'INTEGRITY',
  'ATLAS', 'LEARNING',
] as const;
export type SystemView = typeof SYSTEM_VIEWS[number];

export const PERSONAL_VIEWS = ['NOW', 'LOOPS', 'DAY', 'CONTEXT', 'RECALL'] as const;
export type PersonalView = typeof PERSONAL_VIEWS[number];

export type ViewId = SystemView | PersonalView;

const VIEW_IDS: readonly ViewId[] = [...SYSTEM_VIEWS, ...PERSONAL_VIEWS];

export const isSystemView = (view: ViewId): view is SystemView =>
  (SYSTEM_VIEWS as readonly string[]).includes(view);

export const hashForView = (view: ViewId): string => `#${view.toLowerCase()}`;

export const viewFromHash = (hash: string): ViewId | null => {
  const value = hash.replace(/^#\/?/, '').trim().toUpperCase();
  return (VIEW_IDS as readonly string[]).includes(value) ? value as ViewId : null;
};

export interface NavEntry { id: ViewId; label: string; glyph: string; hint: string }
export interface NavGroup { id: string; label: string; entries: NavEntry[] }

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'operation', label: 'OPERAÇÃO', entries: [
      { id: 'OVERVIEW', label: 'Overview', glyph: '◎', hint: 'Estado atual, atenção e lanes' },
      { id: 'INBOX', label: 'Precisa de você', glyph: '⌾', hint: 'Human Inbox: só o que exige você' },
      { id: 'ACTIONS', label: 'Actions', glyph: '→', hint: 'Ações, elegibilidade e blockers' },
      { id: 'EXECUTION', label: 'Execution', glyph: '⟐', hint: 'Action → Capability → Runtime → Effect → Readback' },
    ],
  },
  {
    id: 'integrity', label: 'INTEGRIDADE', entries: [
      { id: 'TRUTHGRAPH', label: 'TruthGraph', glyph: '⊹', hint: 'Autoridade e posse da verdade' },
      { id: 'CAPABILITIES', label: 'Capabilities', glyph: '⬡', hint: 'O que pode ser feito, e com qual prova' },
      { id: 'SOURCES', label: 'Sources', glyph: '⊞', hint: 'Providers e Universal Projection Bus' },
      { id: 'INTEGRITY', label: 'Integrity', glyph: '⚖', hint: 'Tudo que a interface não consegue provar' },
    ],
  },
  {
    id: 'knowledge', label: 'CONHECIMENTO', entries: [
      { id: 'ATLAS', label: 'Atlas', glyph: '✧', hint: 'Grafo estrutural e exploração' },
      { id: 'LEARNING', label: 'Learning', glyph: '≋', hint: 'Memória semântica, procedural e filamentos' },
    ],
  },
  {
    id: 'personal', label: 'PESSOAL', entries: [
      { id: 'NOW', label: 'Now', glyph: '◈', hint: 'Atenção pessoal, fontes reais' },
      { id: 'LOOPS', label: 'Loops', glyph: '∞', hint: 'Compromissos em movimento' },
      { id: 'DAY', label: 'Day', glyph: '◷', hint: 'Agenda do dia' },
      { id: 'CONTEXT', label: 'Context', glyph: '◇', hint: 'Contextos pessoais' },
      { id: 'RECALL', label: 'Recall', glyph: '⌕', hint: 'Busca nas fontes conectadas' },
    ],
  },
];

/** Barra inferior do mobile: as quatro rotas de maior frequência + acesso ao resto. */
export const MOBILE_PRIMARY: ViewId[] = ['INBOX', 'OVERVIEW', 'ACTIONS', 'ATLAS'];

export const VIEW_TITLES: Record<ViewId, { title: string; lead: string }> = {
  OVERVIEW: { title: 'Estado operacional da Tower.', lead: 'Gates humanos, blockers, capabilities, providers e filas por domínio na compilação atual.' },
  INBOX: { title: 'Gates humanos abertos.', lead: 'Somente entidades com requisito humano explícito na projeção canônica.' },
  ACTIONS: { title: 'Fila operacional.', lead: 'Ações abertas, capability vinculada, runtime, dependências e motivo de avanço ou espera.' },
  EXECUTION: { title: 'Rastreamento de execução.', lead: 'ACTION → CAPABILITY → RUNTIME → EFFECT → READBACK, com fingerprint e horário por etapa.' },
  TRUTHGRAPH: { title: 'Autoridade e conflito de estado.', lead: 'Provider esperado, provider observado, freshness e divergências por domínio.' },
  CAPABILITIES: { title: 'Capabilities executáveis.', lead: 'Backend, status, contrato de execução e evidência disponível por capability.' },
  SOURCES: { title: 'Cobertura de providers.', lead: 'Disponibilidade, freshness e consumidores atendidos pelo Projection Bus.' },
  INTEGRITY: { title: 'Falhas de prova e readback.', lead: 'Invariantes abertos, capabilities sem evidência e leituras que não fecharam.' },
  ATLAS: { title: 'Topologia operacional.', lead: 'Entidades, relações e proveniência materializadas no grafo atual.' },
  LEARNING: { title: 'Relações promovidas e rejeitadas.', lead: 'Filamentos com suporte, contradição, escopo e limite de validade.' },
  NOW: { title: 'Pendências pessoais com fonte.', lead: 'Itens atuais vindos das fontes pessoais conectadas.' },
  LOOPS: { title: 'Compromissos abertos.', lead: 'Estado declarado na fonte e última atualização observada.' },
  DAY: { title: 'Agenda consolidada.', lead: 'Eventos da agenda conectada; propostas permanecem separadas do calendário.' },
  CONTEXT: { title: 'Contextos e ferramentas.', lead: 'Objetivos, registros e integrações disponíveis por área.' },
  RECALL: { title: 'Busca com proveniência.', lead: 'Resultados das fontes conectadas com origem preservada.' },
};

export const entryFor = (view: ViewId): NavEntry =>
  NAV_GROUPS.flatMap(group => group.entries).find(entry => entry.id === view) ?? NAV_GROUPS[0].entries[0];
