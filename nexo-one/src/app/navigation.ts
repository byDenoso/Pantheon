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

const CANONICAL_ROUTE: Record<ViewId, string> = {
  OVERVIEW: '#/cockpit/comando', INBOX: '#/cockpit/comando?view=needs',
  ACTIONS: '#/cockpit/pipeline', EXECUTION: '#/cockpit/pipeline?view=execution',
  TRUTHGRAPH: '#/cockpit/prova?tab=autoridade', CAPABILITIES: '#/cockpit/prova?tab=capabilities',
  SOURCES: '#/cockpit/prova?tab=fontes', INTEGRITY: '#/cockpit/prova?tab=integridade',
  ATLAS: '#/atlas?lente=operacao&view=2d', LEARNING: '#/cockpit/ciencia?tab=campanhas',
  NOW: '#/cockpit/pessoal/now', LOOPS: '#/cockpit/pessoal/loops', DAY: '#/cockpit/pessoal/day',
  CONTEXT: '#/cockpit/pessoal/context', RECALL: '#/cockpit/pessoal/recall',
};

const LEGACY_VIEW: Record<string, ViewId> = {
  OVERVIEW: 'OVERVIEW', NEEDS: 'INBOX', INBOX: 'INBOX', ACTIONS: 'ACTIONS', EXECUTION: 'EXECUTION',
  TRUTHGRAPH: 'TRUTHGRAPH', CAPABILITIES: 'CAPABILITIES', SOURCES: 'SOURCES', INTEGRITY: 'INTEGRITY',
  ATLAS: 'ATLAS', LEARNING: 'LEARNING', NOW: 'NOW', LOOPS: 'LOOPS', DAY: 'DAY', CONTEXT: 'CONTEXT', RECALL: 'RECALL',
};

export const hashForView = (view: ViewId): string => CANONICAL_ROUTE[view];

export const isSystemRoute = (hash: string): boolean => /^#\/?sistema(?:[?&]|$)/i.test(hash);

export const isObservatoryRoute = (hash: string): boolean => /^#\/?observatorio(?:[?&]|$)/i.test(hash);

export const viewFromHash = (hash: string): ViewId | null => {
  const raw = hash.replace(/^#\/?/, '').trim();
  const [path, query = ''] = raw.split('?', 2);
  const value = path.toUpperCase();
  const params = new URLSearchParams(query);
  const pane = params.get('view')?.toUpperCase();
  const tab = params.get('tab')?.toUpperCase();
  if (value === 'COCKPIT/PROVA' && tab) {
    const proofTabs: Record<string, ViewId> = { AUTORIDADE: 'TRUTHGRAPH', CAPABILITIES: 'CAPABILITIES', FONTES: 'SOURCES', INTEGRIDADE: 'INTEGRITY' };
    if (proofTabs[tab]) return proofTabs[tab];
  }
  if (pane && LEGACY_VIEW[pane]) return LEGACY_VIEW[pane];
  if (value === 'ATLAS') return 'ATLAS';
  const legacy = LEGACY_VIEW[value];
  if (legacy) return legacy;
  if (value === 'COCKPIT/COMANDO') return 'OVERVIEW';
  if (value === 'COCKPIT/CIENCIA') return 'LEARNING';
  if (value === 'COCKPIT/PIPELINE') return 'ACTIONS';
  if (value === 'COCKPIT/PROVA') return 'TRUTHGRAPH';
  if (value.startsWith('COCKPIT/PESSOAL/')) {
    const personal = value.slice('COCKPIT/PESSOAL/'.length);
    return LEGACY_VIEW[personal.toUpperCase()] ?? null;
  }
  if (value === 'OBSERVATORIO' || value === 'SISTEMA') return 'OVERVIEW';
  return (VIEW_IDS as readonly string[]).includes(value) ? value as ViewId : null;
};

export interface NavEntry { id: ViewId; label: string; glyph: string; hint: string }
export interface NavGroup { id: string; label: string; entries: NavEntry[] }

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'command', label: 'COMANDO', entries: [
      { id: 'OVERVIEW', label: 'Overview', glyph: '◎', hint: 'Estado atual, atenção e lanes' },
      { id: 'INBOX', label: 'Needs Dener', glyph: '⌾', hint: 'Somente gates canônicos que exigem ação humana explícita' },
    ],
  },
  {
    id: 'pipeline', label: 'PIPELINE', entries: [
      { id: 'ACTIONS', label: 'Actions', glyph: '→', hint: 'Ações, elegibilidade e blockers' },
      { id: 'EXECUTION', label: 'Execution', glyph: '⟐', hint: 'Action → Capability → Runtime → Effect → Readback' },
    ],
  },
  {
    id: 'proof', label: 'PROVA', entries: [
      { id: 'TRUTHGRAPH', label: 'TruthGraph', glyph: '⊹', hint: 'Autoridade e posse da verdade' },
      { id: 'CAPABILITIES', label: 'Capacidades', glyph: '⬡', hint: 'O que pode ser feito, e com qual prova' },
      { id: 'SOURCES', label: 'Sources', glyph: '⊞', hint: 'Providers e Universal Projection Bus' },
      { id: 'INTEGRITY', label: 'Integrity', glyph: '⚖', hint: 'Tudo que a interface não consegue provar' },
    ],
  },
  {
    id: 'atlas', label: 'ATLAS', entries: [
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
  OVERVIEW: { title: 'Início', lead: 'Gates, próxima ação do sistema e mudanças da última sincronização.' },
  INBOX: { title: 'Precisa de você', lead: 'Aprovações humanas que aguardam decisão.' },
  ACTIONS: { title: 'Fila operacional', lead: 'Trabalho por estado, domínio, campanha e dependência.' },
  EXECUTION: { title: 'Execução', lead: 'Rastro ACTION → CAPABILITY → RUNTIME → EFFECT → READBACK.' },
  TRUTHGRAPH: { title: 'Autoridade', lead: 'Fontes esperadas, fontes observadas e divergências.' },
  CAPABILITIES: { title: 'Capacidades', lead: 'Capacidades registradas e evidências publicadas.' },
  SOURCES: { title: 'Fontes', lead: 'Disponibilidade e atualização das fontes conectadas.' },
  INTEGRITY: { title: 'Integridade', lead: 'Lacunas de prova, invariantes e leituras pendentes.' },
  ATLAS: { title: 'Mapa', lead: 'Entidades e relações da projeção atual.' },
  LEARNING: { title: 'Ciência', lead: 'Campanhas, testes, hipóteses, aprendizado e evidência publicada.' },
  NOW: { title: 'Agora', lead: 'Pendências pessoais vindas das fontes conectadas.' },
  LOOPS: { title: 'Loops', lead: 'Compromissos abertos e atualização observada.' },
  DAY: { title: 'Agenda', lead: 'Eventos da agenda conectada.' },
  CONTEXT: { title: 'Contextos', lead: 'Objetivos, registros e integrações disponíveis.' },
  RECALL: { title: 'Busca', lead: 'Resultados das fontes conectadas com origem preservada.' },
};

export const entryFor = (view: ViewId): NavEntry =>
  NAV_GROUPS.flatMap(group => group.entries).find(entry => entry.id === view) ?? NAV_GROUPS[0].entries[0];
