// Paleta única de domínios. Todo renderer de grafo e todo marcador de domínio da
// interface lê daqui, para que NEXO, Ciência, Engenharia e Olympus tenham a mesma
// cor no Mapa, no Galaxy 3D, nos badges e no hero do Início.
// As mesmas cores existem como variáveis CSS (--domain-*) em styles/observatory.css.

export type PaletteTheme = 'dark' | 'light';

const DARK: Record<string, string> = {
  NEXO: '#E9B35B',
  SCIENCE: '#5AB4F2',
  ENGINEERING: '#62CC96',
  OLYMPUS: '#E36A9C',
  ARTIFACT: '#A58BEA',
  PERSONAL: '#4FD1C5',
};

const LIGHT: Record<string, string> = {
  NEXO: '#A86A0E',
  SCIENCE: '#1F6FAE',
  ENGINEERING: '#1F7A4F',
  OLYMPUS: '#A8316A',
  ARTIFACT: '#5F45A8',
  PERSONAL: '#157A70',
};

const FALLBACK: Record<PaletteTheme, string> = { dark: '#8FA7C4', light: '#4A5E78' };

// Nomes alternativos usados por outras projeções para o mesmo domínio.
const ALIASES: Record<string, string> = {
  COSMOLOGY: 'SCIENCE',
  CIENCIA: 'SCIENCE',
  'CIÊNCIA': 'SCIENCE',
  ENGENHARIA: 'ENGINEERING',
  OPERATIONS: 'ENGINEERING',
  OPERACAO: 'ENGINEERING',
  'OPERAÇÃO': 'ENGINEERING',
};

export function canonicalDomain(domain: unknown): string {
  const key = String(domain ?? '').trim().toUpperCase();
  return ALIASES[key] ?? key;
}

export function domainHex(domain: unknown, theme: PaletteTheme = 'dark'): string {
  const table = theme === 'light' ? LIGHT : DARK;
  return table[canonicalDomain(domain)] ?? FALLBACK[theme];
}

export const DOMAIN_ORDER = ['NEXO', 'SCIENCE', 'ENGINEERING', 'OLYMPUS'] as const;
