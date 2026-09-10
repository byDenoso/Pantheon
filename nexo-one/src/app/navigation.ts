// Navegação única para NEXO ONE e Atlas.
// O plano SISTEMA consome o SystemState (fixtures nesta fase).
// O plano PESSOAL preserva o cockpit já existente, que lê /api/world de verdade.
export const SYSTEM_VIEWS = [
  'OVERVIEW', 'INBOX', 'ACTIONS', 'EXECUTION',
  'TRUTHGRAPH', 'CAPABILITIES', 'SOURCES', 'INTEGRITY',
  'ATLAS', 'LEARNING',
] as const;
export type SystemView = typeof SYSTEM_VIEWS[number];

export const PERSONAL_VIEWS = ['NOW', 'LOOPS', 'DAY', 'CONTEXT', 'RECALL'] as const;
export type PersonalView = typeof PERSONAL_VIEWS[number];

export type ViewId = SystemView | PersonalView;

export const isSystemView = (view: ViewId): view is SystemView =>
  (SYSTEM_VIEWS as readonly string[]).includes(view);

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
  OVERVIEW: { title: 'O estado real, agora.', lead: 'Estado global, atenção humana, o que o NEXO pode resolver e como cada lane está.' },
  INBOX: { title: 'Precisa de você.', lead: 'Apenas o que exige intervenção humana. Nada que o sistema possa decidir sozinho.' },
  ACTIONS: { title: 'Ações e elegibilidade.', lead: 'Operação exigida, capability, runtime, risco e por que a ação pode ou não avançar.' },
  EXECUTION: { title: 'Execution trace.', lead: 'ACTION → CAPABILITY → RUNTIME → EFFECT → READBACK, com fingerprints e horários.' },
  TRUTHGRAPH: { title: 'Quem detém a verdade.', lead: 'Autoridade, provider esperado contra observado, freshness e conflitos por domínio.' },
  CAPABILITIES: { title: 'Capability Radar.', lead: 'O que pode ser feito, em qual runtime, com qual prova de execução.' },
  SOURCES: { title: 'Fontes e projeções.', lead: 'Providers, Universal Projection Bus e cobertura de cada consumidor.' },
  INTEGRITY: { title: 'O que não pode ser provado.', lead: 'Achados abertos, capabilities sem evidência e readbacks que falharam.' },
  ATLAS: { title: 'Atlas.', lead: 'Estrutura, relações e proveniência do sistema inteiro em um só mapa.' },
  LEARNING: { title: 'Aprendizado.', lead: 'Filamentos ponderados com suporte, contradição e limite de validade.' },
  NOW: { title: 'O que merece sua atenção.', lead: 'Fontes pessoais conectadas ao servidor real.' },
  LOOPS: { title: 'Compromissos em movimento.', lead: 'Estado declarado na fonte, não inferido.' },
  DAY: { title: 'Um dia que cabe no dia.', lead: 'Agenda real; propostas não alteram compromissos.' },
  CONTEXT: { title: 'Entre no contexto certo.', lead: 'Objetivos, registros e ferramentas por área.' },
  RECALL: { title: 'Encontre. Retome. Avance.', lead: 'Busca nas fontes conectadas, com origem preservada.' },
};

export const entryFor = (view: ViewId): NavEntry =>
  NAV_GROUPS.flatMap(group => group.entries).find(entry => entry.id === view) ?? NAV_GROUPS[0].entries[0];
