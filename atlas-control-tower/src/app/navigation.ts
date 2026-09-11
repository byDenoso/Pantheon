export const productNavigation = [
  { label: 'Visão geral', path: '/', icon: '◌' },
  { label: 'Domínios', path: '/universes', icon: '◎' },
  { label: 'Grafos', path: '/graphs', icon: '⌘' },
  { label: 'Operação', path: '/operations', icon: '▦' },
  { label: 'Proveniência', path: '/provenance', icon: '↗' },
] as const;

export type ProductNavigationItem = (typeof productNavigation)[number];
