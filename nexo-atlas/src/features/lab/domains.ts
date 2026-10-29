// Exact shared aliases only. NEXO, ARTIFACT and Engineering remain distinct.
import {canonicalDomain} from '../../shared/domain-identity.mjs';
export const normDomain = (domain: string) => canonicalDomain(domain);
