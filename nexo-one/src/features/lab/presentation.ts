import type { TestEntity } from './model.ts';

/** Metadata and unavailable envelopes are not published scientific results. */
export function hasPublishedValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.some(hasPublishedValue);
  if (typeof value === 'object') {
    if ('value' in value) return hasPublishedValue((value as { value: unknown }).value);
    return Object.entries(value).some(([key, item]) => !/^(source_ref|fingerprint|unavailable_reason|provenance)$/.test(key) && hasPublishedValue(item));
  }
  return true;
}

/** Presentation only: never edits the recorded result or the review state. */
export function currentVerdictText(test: Pick<TestEntity, 'verdict' | 'verdictRaw' | 'readiness' | 'status' | 'review' | 'meaning' | 'result'>): string {
  if (!test.status && !test.review && !test.verdictRaw && !test.meaning && !hasPublishedValue(test.result)) return 'Estado e resultado não publicados nesta leitura. Ainda não há base para apresentar uma conclusão.';
  switch (test.verdict) {
    case 'REFUTED': return 'A revisão atual refutou este resultado. O registro da execução abaixo permanece disponível para auditoria e não representa uma conclusão vigente.';
    case 'CONFIRMED': return 'O resultado está confirmado na revisão publicada, dentro dos limites deste teste.';
    case 'REVIEW': return 'O resultado segue em revisão. A interpretação da execução ainda não é uma conclusão confirmada.';
    case 'READY': return test.readiness?.eligible === true ? 'O teste está READY e elegível segundo a verificação publicada. O despacho continua dependente da bateria.' : test.readiness?.eligible === false ? 'O teste está marcado READY, mas a verificação publicada o considera inelegível para execução.' : 'O teste está marcado READY na fila. Esse estado, sozinho, não comprova elegibilidade para a próxima execução.';
    case 'BLOCKED': return 'O teste está bloqueado. A ausência de execução não é uma refutação científica.';
    case 'RUNNING': return 'O teste está em processamento; ainda não há conclusão publicada desta execução.';
    case 'CHECKPOINTED': return 'A execução foi salva em um checkpoint; isso não equivale a um resultado concluído.';
    case 'DISCARDED': return 'O teste foi descartado no registro atual. Consulte os detalhes do contrato e da execução.';
    default: return test.verdictRaw?.toUpperCase() === 'INCONCLUSIVE' ? 'A execução registrou um resultado inconclusivo. Ainda não há confirmação pela revisão publicada.' : test.verdictRaw || test.meaning || hasPublishedValue(test.result) ? 'O resultado é provisório; ainda não está confirmado pela revisão publicada.' : 'O teste está registrado, mas o resultado científico ainda não foi publicado nesta leitura.';
  }
}

export const normalizeSearch = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function matchesSearch(query: string, ...fields: Array<string | null | undefined>): boolean {
  const haystack = normalizeSearch(fields.filter(Boolean).join(' '));
  return normalizeSearch(query).trim().split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
}

export interface BoardRecord {
  id: string; at: string; from: string; to: string; text: string;
  expires_at?: string | null; resolved_at?: string | null;
  priority?: string | null; next_action?: string | null; owner?: string | null; status?: string | null; reply_to?: string | null;
}
export function boardMeta(post: BoardRecord, now: number, posts: BoardRecord[] = []) {
  const declaredAction = post.text.match(/(?:Próxim[oa] (?:aç[ãa]o|passo)|Aç[ãa]o esperada|Next action)\s*:\s*([^\n]+)/i)?.[1]?.trim();
  const declaredPriority = post.text.match(/(?:Prioridade|Priority)\s*:\s*([\p{L}\p{N}_-]+)/iu)?.[1];
  return {
    owner: post.owner || post.to,
    priority: post.priority || declaredPriority || 'Não informada',
    status: post.resolved_at ? 'Resolvido' : post.expires_at && Date.parse(post.expires_at) <= now ? 'Expirado' : posts.some(reply => reply.reply_to === post.id) ? 'Respondido' : /^(ACCEPTED|ACKNOWLEDGED)$/.test(post.status ?? '') ? 'Aceito' : 'Aberto',
    nextAction: post.next_action || declaredAction || null,
  };
}

export const readinessLabel = (test: Pick<TestEntity, 'readiness'>): string => test.readiness?.eligible === true ? 'Elegível na verificação publicada' : test.readiness?.eligible === false ? 'Inelegível na verificação publicada' : 'Elegibilidade não publicada';
