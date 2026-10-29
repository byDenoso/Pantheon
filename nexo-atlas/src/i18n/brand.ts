// Single source for the institutional name. The wordmark "NEXO" stays as the logo;
// the full name is what titles, metadata and the header lockup must show.
import type {Locale} from '../atlas/api.ts';

export const BRAND_NAME: Record<Locale, string> = {'pt-BR': 'Instituto de Pesquisa Nexo', en: 'Nexo Cosmology Institute'};
export const BRAND_DESCRIPTOR: Record<Locale, string> = {'pt-BR': 'Cosmologia computacional', en: 'Computational cosmology'};
export const brandTitle = (locale: Locale, page?: string) => page ? `${page} | ${BRAND_NAME[locale]}` : `${BRAND_NAME[locale]} — ${BRAND_DESCRIPTOR[locale]}`;
