import type {SystemState} from '../contracts/system.ts';
import type {Lang} from '../i18n/state-language.ts';

export type RoadmapRow = {item: string; titulo: string; status: string; dono: string; prio: string; proximo_teste: string; depende_de: string; atualizado: string; nota: string};
export type MuralRow = {data: string; de: string; para: string; texto: string; link: string};
export type ShadowBoardData = {contract?: string; unavailable?: string; modified_at?: string | null; source_ref?: string; roadmap?: RoadmapRow[]; mural?: MuralRow[]};

export function shadowBoardOf(state: SystemState): ShadowBoardData | null {
  const board = (state as unknown as {read_model?: {shadow?: ShadowBoardData}}).read_model?.shadow;
  return board && board.contract === 'NEXO_SHADOW_BOARD_V1' ? board : null;
}

export const STATUS_ORDER = ['RUNNING', 'OPEN', 'PARTIAL', 'BLOCKED_INPUT', 'DONE_UNREVIEWED', 'DONE_SURVIVED', 'DONE', 'FROZEN', 'RETIRED'];
export const statusRank = (status: string) => { const i = STATUS_ORDER.indexOf(status); return i < 0 ? STATUS_ORDER.length : i; };
export const SHADOW_COPY = {
  pt: {title: 'Roadmap e Mural', roadmap: 'Roadmap', mural: 'Mural', all: 'Todos', owner: 'Dono', next: 'Próximo teste', depends: 'Depende de', updated: 'Atualizado', unavailable: 'Quadro indisponível agora', source: 'Fonte: Tower SHADOW', empty: 'Sem itens.', more: 'Ver mais', open: 'Abrir planilha'},
  en: {title: 'Roadmap and Mural', roadmap: 'Roadmap', mural: 'Mural', all: 'All', owner: 'Owner', next: 'Next test', depends: 'Depends on', updated: 'Updated', unavailable: 'Board unavailable right now', source: 'Source: SHADOW tower', empty: 'No items.', more: 'Show more', open: 'Open sheet'}
} as const;
