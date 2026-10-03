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
    case 'REJECTED': return 'A execução terminou com rejeição pelo critério registrado. Esse desfecho negativo é distinto da refutação por revisão independente.';
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
  refs?: string[];
  expires_at?: string | null; resolved_at?: string | null;
  priority?: string | null; next_action?: string | null; owner?: string | null; status?: string | null; reply_to?: string | null;
  in_reply_to?: string | null;
}

/** A reply proves conversation only. It never resolves an incident or transfers WORK. */
export function boardConversation(post: BoardRecord, posts: BoardRecord[], now = Date.now()) {
  const selfNote = Boolean(post.from.trim()) && post.from !== 'ALL' && post.from === post.to;
  const recipients = post.to === 'ALL' ? null : [post.to];
  const replies = posts.filter(reply => reply.id !== post.id
    && (reply.reply_to || reply.in_reply_to) === post.id
    && reply.from !== post.from && reply.from !== 'ALL'
    && (recipients === null || recipients.includes(reply.from))
    && (reply.to === post.from || reply.to === 'ALL')
    && reply.text.trim() && Number.isFinite(Date.parse(reply.at))
    && Date.parse(reply.at) >= Date.parse(post.at) && Date.parse(reply.at) <= now)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  // ALL has no published per-role response contract: one reply cannot close it for everyone.
  const answered = !selfNote && recipients !== null && recipients.every(role => replies.some(reply => reply.from === role));
  const declaredType = post.text.match(/(?:^|\n)\s*Tipo\s*:\s*(Reclamação|Conteúdo)\s*(?:$|\n)/iu)?.[1];
  const kind = declaredType && normalizeSearch(declaredType) === 'reclamacao' ? 'Reclamação' : 'Conteúdo';
  const archived = Boolean(post.resolved_at) || Boolean(post.expires_at && Date.parse(post.expires_at) <= now);
  // A self-addressed record is a note, not a request: retain it in history without inventing closure.
  return { replies, answered, archived, selfNote, awaiting: !selfNote && !answered && !archived,
    status: selfNote ? 'Anotação própria' : answered ? 'Respondido' : 'Aguardando resposta', kind,
    typeDeclared: Boolean(declaredType), audienceUnknown: recipients === null };
}

/** Linked answers stay inside their thread; orphaned records remain visible. */
export function boardThreads(posts: BoardRecord[], now = Date.now()) {
  const answerIds = new Set(posts.flatMap(post => boardConversation(post, posts, now).replies.map(reply => reply.id)));
  const roots = posts.filter(post => !answerIds.has(post.id));
  const visible = new Set(roots.flatMap(post => [post.id, ...boardThreadReplies(post, posts, now).map(reply => reply.id)]));
  // Malformed cyclic links must never make records disappear from history.
  return [...roots, ...posts.filter(post => !visible.has(post.id))];
}

export function boardThreadReplies(post: BoardRecord, posts: BoardRecord[], now = Date.now()): BoardRecord[] {
  const seen = new Set([post.id]);
  const collected: BoardRecord[] = [];
  const visit = (parent: BoardRecord) => {
    for (const reply of boardConversation(parent, posts, now).replies) {
      if (seen.has(reply.id)) continue;
      seen.add(reply.id); collected.push(reply); visit(reply);
    }
  };
  visit(post);
  return collected;
}

/** A focus card is a receipt, not a new exchange or a claim of current activity. */
export function latestBoardRecord(posts: BoardRecord[], now = Date.now()): BoardRecord | null {
  return posts.filter(post => typeof post.text === 'string' && post.text.trim() && typeof post.from === 'string' && post.from.trim() && typeof post.to === 'string' && post.to.trim() && Number.isFinite(Date.parse(post.at)) && Date.parse(post.at) <= now)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
}
export function boardMeta(post: BoardRecord, now: number, posts: BoardRecord[] = []) {
  const declaredAction = post.text.match(/(?:Próxim[oa] (?:aç[ãa]o|passo)|Aç[ãa]o esperada|Next action)\s*:\s*([^\n]+)/i)?.[1]?.trim();
  const declaredPriority = post.text.match(/(?:Prioridade|Priority)\s*:\s*([\p{L}\p{N}_-]+)/iu)?.[1];
  return {
    owner: post.owner || post.to,
    priority: post.priority || declaredPriority || 'Não informada',
    status: post.resolved_at ? 'Resolvido' : post.expires_at && Date.parse(post.expires_at) <= now ? 'Expirado' : boardConversation(post, posts, now).answered ? 'Respondido' : /^(ACCEPTED|ACKNOWLEDGED)$/.test(post.status ?? '') ? 'Aceito' : 'Aberto',
    nextAction: post.next_action || declaredAction || null,
  };
}

export const readinessLabel = (test: Pick<TestEntity, 'readiness'>): string => test.readiness?.eligible === true ? 'Elegível na verificação publicada' : test.readiness?.eligible === false ? 'Inelegível na verificação publicada' : 'Elegibilidade não publicada';

/** A display cut cannot turn a frontier member or an unfinished test into progress. */
export function roadmapTrail(tests: TestEntity[], frontier: string[] | null) {
  const ids = new Set(frontier ?? []);
  const ahead = tests.filter(test => frontier === null ? test.status?.toUpperCase() === 'READY' : ids.has(test.id));
  const aheadIds = new Set(ahead.map(test => test.id));
  const walked = tests.filter(test => !aheadIds.has(test.id) && (
    ['CONFIRMED', 'REFUTED', 'REJECTED'].includes(test.verdict)
    || (test.executedAt && test.verdictRaw && ['REVIEW', 'PROVISIONAL'].includes(test.verdict))
  )).sort((a, b) => String(a.executedAt ?? a.createdAt ?? '').localeCompare(String(b.executedAt ?? b.createdAt ?? '')));
  const accounted = new Set([...ahead, ...walked].map(test => test.id));
  return { ahead, walked, other: tests.filter(test => !accounted.has(test.id)) };
}


/** A shortened heading is a literal excerpt; the complete record stays available. */
export function compactTitle(value: string, limit = 96): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const prefix = text.slice(0, limit).replace(/\s+\S*$/, '');
  return (prefix || text.slice(0, limit)) + '…';
}

/** Missing source data cannot be displayed as an empty READY queue. */
export function hasPublishedTestCollection(state: unknown): boolean {
  if (!state || typeof state !== 'object') return false;
  const model = (state as { read_model?: { tests?: unknown } }).read_model;
  return Boolean(model && model.tests && typeof model.tests === 'object' && !Array.isArray(model.tests));
}
