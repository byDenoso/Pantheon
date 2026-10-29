// Structured source values as readable content. Presentation only: nothing is reordered into meaning, rounded or translated.
// Field names with an everyday name are labelled; any other key is printed exactly as published.
import type {ReactNode} from 'react';
import {hasPublishedValue} from '../features/lab/presentation.ts';
import type {Lang} from '../i18n/state-language.ts';
import {WORKSPACE_COPY, keyLabel} from './copy.ts';
import {dateParts, evidenceValue} from './model.ts';
import {describeBlob, displayJson} from './blob.ts';

const TEXT_LIMIT = 16000, MAX_DEPTH = 4, LIST_LIMIT = 60;
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isPlain = (value: unknown) => value === null || ['string', 'number', 'boolean'].includes(typeof value);
const looksLikeUrl = (value: string) => /^https?:\/\/[^\s]+$/i.test(value);
const looksLikeDate = (value: string) => /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}|$)/.test(value);

/** Text that may be a binary attachment: a short summary, with only the first 200 characters behind a collapsed disclosure. */
export function EvidenceText({text, lang}: {text: string; lang: Lang}): ReactNode {
  const summary = describeBlob(text, lang);
  if (!summary) return text;
  return <><span className="pw-ref">{summary}</span><details><summary>{lang === 'en' ? 'Start of the raw content (200 characters)' : 'Início do conteúdo bruto (200 caracteres)'}</summary><pre className="pw-ref">{text.slice(0, 200)}…</pre></details></>;
}

export function DateText({value, lang}: {value: unknown; lang: Lang}) {
  const parts = dateParts(value, lang);
  return parts ? <time dateTime={parts.iso} title={parts.iso}>{parts.label}</time> : <span className="pw-absent">{typeof value === 'string' && value.trim() ? (lang === 'en' ? 'Recorded date is invalid' : 'Data registrada inválida') : WORKSPACE_COPY[lang].notRecorded}</span>;
}

function Plain({value, lang}: {value: unknown; lang: Lang}): ReactNode {
  const m = WORKSPACE_COPY[lang];
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return <span className="pw-absent">{m.notRecorded}</span>;
  if (typeof value === 'boolean') return value ? m.yes : m.no;
  if (typeof value === 'number') return String(value);
  const text = String(value);
  if (describeBlob(text, lang)) return <EvidenceText text={text} lang={lang}/>;
  // an address is shown as text: this page never links to a place the source did not explicitly publish as a link
  if (looksLikeUrl(text)) return <span className="pw-ref">{text}</span>;
  if (looksLikeDate(text)) { const parts = dateParts(text, lang); if (parts) return <time dateTime={parts.iso} title={parts.iso}>{parts.label}</time>; }
  return text.length > TEXT_LIMIT ? <>{text.slice(0, TEXT_LIMIT)}… <span className="pw-absent">{m.clipped}</span></> : text;
}

function Node({value, lang, depth}: {value: unknown; lang: Lang; depth: number}): ReactNode {
  if (!hasPublishedValue(value)) return <span className="pw-absent">{WORKSPACE_COPY[lang].notRecorded}</span>;
  if (isPlain(value) || value === undefined) return <Plain value={value} lang={lang}/>;
  if (depth >= MAX_DEPTH) {
    const text = displayJson(value, lang);
    return <><pre className="pw-raw">{text.slice(0, TEXT_LIMIT)}</pre>{text.length > TEXT_LIMIT && <p className="pw-absent">{WORKSPACE_COPY[lang].clipped}</p>}</>;
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, LIST_LIMIT), m = WORKSPACE_COPY[lang];
    return <><ul className={items.every(isPlain) ? 'pw-list' : 'pw-list pw-list-records'}>{items.map((item, index) => <li key={index}><Node value={item} lang={lang} depth={depth + 1}/></li>)}</ul>{value.length > LIST_LIMIT && <p className="pw-absent">{m.clipped}</p>}</>;
  }
  if (isRecord(value)) return <dl className="pw-fields">{Object.entries(value).map(([key, entry]) => { const name = keyLabel(key, lang); return <div key={key}><dt className={name.known ? undefined : 'pw-key'}>{name.label}</dt><dd><Node value={entry} lang={lang} depth={depth + 1}/></dd></div>; })}</dl>;
  return String(value);
}

/** A value from the reading. `empty` is the sentence for "the source recorded nothing here". */
export function SourceValue({value, lang, empty}: {value: unknown; lang: Lang; empty?: string}) {
  const m = WORKSPACE_COPY[lang], clean = evidenceValue(value);
  if (!hasPublishedValue(clean)) return <p className="pw-absent">{empty ?? m.unknown}</p>;
  if (typeof clean === 'string' && describeBlob(clean, lang)) return <div className="pw-prose"><p><EvidenceText text={clean} lang={lang}/></p></div>;
  if (typeof clean === 'string') return <div className="pw-prose">{clean.slice(0, TEXT_LIMIT).split(/\n{2,}/).filter(block => block.trim()).map((block, index) => <p key={index}>{block}</p>)}{clean.length > TEXT_LIMIT && <p className="pw-absent">{m.clipped}</p>}</div>;
  return <div className="pw-structured"><Node value={clean} lang={lang} depth={0}/></div>;
}
export const hasValue = (value: unknown) => hasPublishedValue(evidenceValue(value));
