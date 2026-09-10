// Parser determinístico da Command Bar. Sem LLM, sem heurística opaca.
// Três classes: NAVIGATE, FIND e ACT — e ACT nunca executa escrita nesta camada.
import { NAV_GROUPS, type ViewId } from './navigation.ts';

export interface CommandResult {
  kind: 'NAVIGATE' | 'FIND' | 'REJECTED';
  view: ViewId;
  query?: string;
  message?: string;
}

const ALIASES: Record<string, ViewId> = {
  OVERVIEW: 'OVERVIEW', ESTADO: 'OVERVIEW', VISAO: 'OVERVIEW',
  INBOX: 'INBOX', 'PRECISA DE VOCE': 'INBOX', HUMANO: 'INBOX', DECISOES: 'INBOX',
  ACTIONS: 'ACTIONS', ACOES: 'ACTIONS',
  EXECUTION: 'EXECUTION', EXECUCAO: 'EXECUTION', TRACE: 'EXECUTION', 'BLACK BOX': 'EXECUTION',
  TRUTHGRAPH: 'TRUTHGRAPH', VERDADE: 'TRUTHGRAPH', AUTORIDADE: 'TRUTHGRAPH',
  CAPABILITIES: 'CAPABILITIES', CAPABILITY: 'CAPABILITIES', RADAR: 'CAPABILITIES',
  SOURCES: 'SOURCES', FONTES: 'SOURCES', BUS: 'SOURCES', PROVIDERS: 'SOURCES',
  INTEGRITY: 'INTEGRITY', INTEGRIDADE: 'INTEGRITY',
  ATLAS: 'ATLAS', GRAFO: 'ATLAS', MAPA: 'ATLAS',
  LEARNING: 'LEARNING', APRENDIZADO: 'LEARNING', MEMORIA: 'LEARNING', FILAMENTOS: 'LEARNING',
  NOW: 'NOW', AGORA: 'NOW', LOOPS: 'LOOPS', DAY: 'DAY', DIA: 'DAY',
  CONTEXT: 'CONTEXT', CONTEXTO: 'CONTEXT', RECALL: 'RECALL', BUSCAR: 'RECALL',
};

const WRITE_VERBS = /^(criar|enviar|agendar|excluir|apagar|deploy|promover|aprovar|executar|rodar)\b/i;

const normalize = (value: string): string =>
  value.trim().replace(/^\//, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export function parseCommand(input: string): CommandResult {
  const raw = input.trim();
  if (!raw) return { kind: 'NAVIGATE', view: 'OVERVIEW' };
  const key = normalize(raw);
  if (ALIASES[key]) return { kind: 'NAVIGATE', view: ALIASES[key] };
  if (WRITE_VERBS.test(raw)) {
    return {
      kind: 'REJECTED', view: 'ACTIONS',
      message: 'Esta interface não executa escrita. A ação foi interpretada como consulta ao registro de ações.',
    };
  }
  return { kind: 'FIND', view: 'ATLAS', query: raw };
}

export const commandSuggestions = (): { label: string; view: ViewId }[] =>
  NAV_GROUPS.flatMap(group => group.entries.map(entry => ({ label: entry.label, view: entry.id })));
