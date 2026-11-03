// Single source for the site name. The wordmark "NEXO" is the name; the
// descriptor carries the author so titles, metadata and the header lockup
// identify the research with Dener Pereira.
import type {Locale} from '../atlas/api.ts';

export const BRAND_NAME: Record<Locale, string> = {'pt-BR': 'NEXO', en: 'NEXO'};
export const BRAND_AUTHOR = 'Dener Pereira';
export const BRAND_DESCRIPTOR: Record<Locale, string> = {'pt-BR': `Cosmologia computacional — ${BRAND_AUTHOR}`, en: `Computational cosmology — ${BRAND_AUTHOR}`};
export const brandTitle = (locale: Locale, page?: string) => page ? `${page} | ${BRAND_NAME[locale]}` : `${BRAND_NAME[locale]} · ${BRAND_DESCRIPTOR[locale]}`;
