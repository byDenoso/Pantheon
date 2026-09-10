// Primitivos de estado. Nenhum deles conhece fixtures: recebem só o contrato.
import type {
  AuthorityClass, CapabilityStatus, Domain, EntityState, Freshness, Readback, Severity,
} from '../contracts/system.ts';
import { STATE_LABEL, capabilityToneOf, dateTime, label, toneOf, type Tone } from '../viewmodels/tokens.ts';

export function StatusBadge(
  { state, tone, title, compact }: { state: string; tone?: Tone; title?: string; compact?: boolean },
) {
  const resolved = tone ?? toneOf(state as EntityState);
  return (
    <span className={`badge tone-${resolved}${compact ? ' compact' : ''}`} title={title ?? state}>
      <i aria-hidden="true" className={`glyph glyph-${resolved}`} />
      {label(state)}
    </span>
  );
}

const FRESHNESS_NOTE: Record<string, string> = {
  LIVE: 'Leitura dentro do TTL.',
  RECENT: 'Leitura recente, dentro do TTL.',
  AGING: 'Leitura fora da janela ideal; ainda não expirada.',
  STALE: 'Leitura anterior. O conteúdo pode não refletir a fonte agora.',
  UNKNOWN: 'Sem leitura válida. O estado é desconhecido, não vazio.',
};

export function FreshnessIndicator({ freshness, showTime = true }: { freshness: Freshness; showTime?: boolean }) {
  const tone = toneOf(freshness.state);
  return (
    <span className={`freshness tone-${tone}`} title={FRESHNESS_NOTE[freshness.state]}>
      <i aria-hidden="true" className={`spark spark-${freshness.state.toLowerCase()}`} />
      <span>{label(freshness.state)}</span>
      {showTime && <small>{freshness.observed_at ? dateTime(freshness.observed_at) : 'sem leitura'}</small>}
    </span>
  );
}

export function SourceRef({ value, dim }: { value: string; dim?: boolean }) {
  return <code className={`source-ref${dim ? ' dim' : ''}`} title={value}>{value}</code>;
}

export function Fingerprint({ value, prefix = 'fp' }: { value: string | null; prefix?: string }) {
  if (!value) return <code className="fingerprint-chip empty" title="Sem fingerprint observado">{prefix} —</code>;
  return <code className="fingerprint-chip" title={value}>{value}</code>;
}

const AUTHORITY_NOTE: Record<AuthorityClass, string> = {
  TRUTH_OWNER: 'Detém a verdade deste domínio.',
  DELEGATED: 'Opera sob autoridade delegada.',
  DERIVED: 'Derivada de outra fonte; não decide verdade.',
  NON_AUTHORITATIVE: 'Não autoritativa. Nada aqui prova estado.',
};

export function AuthorityBadge({ authority }: { authority: AuthorityClass }) {
  const tone: Tone = authority === 'TRUTH_OWNER' ? 'live'
    : authority === 'NON_AUTHORITATIVE' ? 'conflict' : 'snapshot';
  return (
    <span className={`badge outline tone-${tone}`} title={AUTHORITY_NOTE[authority]}>
      {label(authority)}
    </span>
  );
}

const CAPABILITY_NOTE: Record<CapabilityStatus, string> = {
  PASS: 'Exercida com evidência de execução.',
  UNVERIFIED: 'Declarada e nunca exercida. Ausência de prova, não funcionalidade parcial.',
  UNKNOWN: 'Sem declaração e sem evidência. Nada pode ser afirmado.',
  RETIRED_RUNTIME: 'Retirada por decisão explícita. Evidência histórica não autoriza execução.',
  BLOCKED: 'Impedida. A operação não pode sequer ser tentada.',
};

export function CapabilityBadge({ status, id }: { status: CapabilityStatus; id?: string }) {
  return (
    <span className={`badge tone-${capabilityToneOf(status)}`} title={`${id ? `${id} · ` : ''}${CAPABILITY_NOTE[status]}`}>
      <i aria-hidden="true" className={`glyph glyph-${capabilityToneOf(status)}`} />
      {STATE_LABEL[status] ?? status}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === 'INFO') return <span className="badge outline tone-live compact">INFO</span>;
  const tone: Tone = severity === 'P0' ? 'conflict' : severity === 'P1' ? 'degraded' : 'snapshot';
  return <span className={`badge severity tone-${tone} compact`} title={`Severidade ${severity}`}>{severity}</span>;
}

const DOMAIN_GLYPH: Record<Domain, string> = { NEXO: '⌘', SCIENCE: '✧', ENGINEERING: '⌥', OLYMPUS: '△' };

export function DomainBadge({ domain, muted }: { domain: Domain; muted?: boolean }) {
  return (
    <span className={`domain-badge${muted ? ' muted' : ''}`} data-domain={domain}>
      <i aria-hidden="true">{DOMAIN_GLYPH[domain]}</i>{domain}
    </span>
  );
}

export function ReadbackBadge({ readback }: { readback: Readback }) {
  return (
    <span className={`badge tone-${toneOf(readback.status)}`} title={readback.explanation}>
      <i aria-hidden="true" className={`glyph glyph-${toneOf(readback.status)}`} />
      Readback {label(readback.status)}
    </span>
  );
}

export function MetaRow({ items }: { items: { term: string; value: React.ReactNode }[] }) {
  return (
    <dl className="meta-row">
      {items.map(item => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
