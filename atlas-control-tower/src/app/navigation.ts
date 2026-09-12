export const productNavigation = [
  { label: 'Cockpit', path: '/', icon: '⌘' },
  { label: 'Domínios', path: '/universes', icon: '◎' },
  { label: 'Operação', path: '/operations', icon: '▦' },
  { label: 'Proveniência', path: '/provenance', icon: '↗' },
  { label: 'Visão geral', path: '/overview', icon: '◌' },
] as const;

export type ProductNavigationItem = (typeof productNavigation)[number];
