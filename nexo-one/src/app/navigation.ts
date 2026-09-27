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
    id: 'command', label: 'INÍCIO', entries: [
      { id: 'OVERVIEW', label: 'Resumo', glyph: '◎', hint: 'Estado atual, decisões pendentes e próximas etapas' },
      { id: 'INBOX', label: 'Decisões', glyph: '⌾', hint: 'Escolhas que precisam de autorização humana' },
    ],
  },
  {
    id: 'pipeline', label: 'OPERAÇÃO', entries: [
      { id: 'ACTIONS', label: 'Tarefas', glyph: '→', hint: 'O que está pronto, em andamento ou impedido' },
      { id: 'EXECUTION', label: 'Execução', glyph: '⟐', hint: 'O que foi tentado, o que mudou e como foi confirmado' },
    ],
  },
  {
    id: 'proof', label: 'PROVA', entries: [
      { id: 'TRUTHGRAPH', label: 'Fontes oficiais', glyph: '⊹', hint: 'Compare as fontes reconhecidas e veja onde divergem' },
      { id: 'CAPABILITIES', label: 'Capacidades', glyph: '⬡', hint: 'O que pode ser feito, e com qual prova' },
      { id: 'SOURCES', label: 'Fontes', glyph: '⊞', hint: 'Quais fontes responderam e quando foram atualizadas' },
      { id: 'INTEGRITY', label: 'Integridade', glyph: '⚖', hint: 'O que ainda não tem comprovação e por que isso importa' },
    ],
  },
  {
    id: 'atlas', label: 'ATLAS', entries: [
      { id: 'ATLAS', label: 'Atlas', glyph: '✧', hint: 'Grafo estrutural e exploração' },
      { id: 'LEARNING', label: 'Aprendizado', glyph: '≋', hint: 'Estudos, hipóteses, testes e resultados relacionados' },
    ],
  },
  {
    id: 'personal', label: 'PESSOAL', entries: [
      { id: 'NOW', label: 'Now', glyph: '◈', hint: 'Atenção pessoal, fontes reais' },
      { id: 'LOOPS', label: 'Compromissos', glyph: '∞', hint: 'Compromissos em andamento e próximas atualizações' },
      { id: 'DAY', label: 'Agenda', glyph: '◷', hint: 'Eventos das agendas conectadas' },
      { id: 'CONTEXT', label: 'Contextos', glyph: '◇', hint: 'Objetivos e informações das fontes conectadas' },
      { id: 'RECALL', label: 'Busca', glyph: '⌕', hint: 'Pesquise nas fontes conectadas e veja a origem' },
    ],
  },
];

/** Barra inferior do mobile: as quatro rotas de maior frequência + acesso ao resto. */
export const MOBILE_PRIMARY: ViewId[] = ['INBOX', 'OVERVIEW', 'ACTIONS', 'ATLAS'];

export const VIEW_TITLES: Record<ViewId, { title: string; lead: string }> = {
  OVERVIEW: { title: 'Início', lead: 'Decisões pendentes, tarefas em andamento e mudanças recentes.' },
  INBOX: { title: 'Decisões', lead: 'Escolhas que precisam de sua decisão ou autorização.' },
  ACTIONS: { title: 'Tarefas', lead: 'O que está pronto, em andamento, impedido ou autorizado a seguir.' },
  EXECUTION: { title: 'Execução', lead: 'O que a automação tentou, o que mudou e como a fonte confirmou o resultado.' },
  TRUTHGRAPH: { title: 'Fontes oficiais', lead: 'Compare as fontes reconhecidas e veja onde suas informações divergem.' },
  CAPABILITIES: { title: 'Recursos disponíveis', lead: 'O que o sistema pode fazer e qual comprovação respalda cada recurso.' },
  SOURCES: { title: 'Fontes', lead: 'Quais fontes responderam, quando foram atualizadas e o que informaram.' },
  INTEGRITY: { title: 'Integridade', lead: 'O que ainda não tem comprovação e como isso limita as próximas ações.' },
  ATLAS: { title: 'Mapa', lead: 'Assuntos do sistema e ligações entre eles.' },
  LEARNING: { title: 'Ciência', lead: 'Estudos, hipóteses, testes e resultados com suas evidências.' },
  NOW: { title: 'Agora', lead: 'Pendências pessoais vindas das fontes conectadas.' },
  LOOPS: { title: 'Compromissos', lead: 'Compromissos em andamento e próximas atualizações.' },
  DAY: { title: 'Agenda', lead: 'Eventos da agenda conectada.' },
  CONTEXT: { title: 'Contextos', lead: 'Objetivos, registros e integrações disponíveis.' },
  RECALL: { title: 'Busca', lead: 'Resultados das fontes conectadas com origem preservada.' },
};

export const entryFor = (view: ViewId): NavEntry =>
  NAV_GROUPS.flatMap(group => group.entries).find(entry => entry.id === view) ?? NAV_GROUPS[0].entries[0];
