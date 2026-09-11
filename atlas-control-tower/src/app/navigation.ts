export const productNavigation = [
  { label: 'Visão geral', path: '/', icon: '◌' },
  { label: 'Universos', path: '/universes', icon: '◎' },
  { label: 'Learning', path: '/learning', icon: '⌁' },
  { label: 'Operação', path: '/operations', icon: '▦' },
  { label: 'Proveniência', path: '/provenance', icon: '↗' },
] as const;

export type ProductNavigationItem = (typeof productNavigation)[number];
