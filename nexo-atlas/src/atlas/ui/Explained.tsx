import {useId, useState} from 'react';
import type {Locale} from '../api.ts';
import {annotate} from '../glossary.ts';
import {useReadingMode} from './useReadingMode.ts';

function Term({term, definition, locale}: {term: string; definition: string; locale: Locale}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <>
    <button type="button" className="nexo-term" aria-expanded={open} aria-controls={id} title={locale === 'en' ? 'What is this?' : 'O que é isto?'} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); } }}>{term}</button>
    {open && <span id={id} role="note" className="nexo-term-tip">{definition}</span>}
  </>;
}

/** Reviewed text, unchanged. In the "from scratch" level the first mention of each glossary term opens a short explanation. */
export default function Explained({text, locale, as: Tag = 'span', className}: {text: string; locale: Locale; as?: 'span' | 'p'; className?: string}) {
  const mode = useReadingMode();
  if (mode !== 'plain') return <Tag className={className}>{text}</Tag>;
  const segments = annotate(text, locale);
  return <Tag className={className ? `${className} nexo-explained` : 'nexo-explained'}>{segments.map((segment, index) => typeof segment === 'string' ? segment : <Term key={index} term={segment.term} definition={segment.definition} locale={locale}/>)}</Tag>;
}
