export type SystemSourceKind = 'fixture' | 'remote';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Produção/preview usam o endpoint real. Fixtures ficam restritas ao runtime local
 * para regressão visual e desenvolvimento, sem depender de flag de ambiente esquecível.
 */
export function sourceKindForHost(hostname: string): SystemSourceKind {
  return LOCAL_HOSTS.has(hostname.trim().toLowerCase()) ? 'fixture' : 'remote';
}
