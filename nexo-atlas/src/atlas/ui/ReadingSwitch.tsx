import type {Locale} from '../api.ts';
import {READING_LABELS, setReadingMode, useReadingMode, type ReadingMode} from './useReadingMode.ts';

export default function ReadingSwitch({locale}: {locale: Locale}) {
  const mode = useReadingMode(), labels = READING_LABELS[locale];
  const options: [ReadingMode, string, string][] = [['plain', labels.plain, labels.plainHint], ['technical', labels.technical, labels.technicalHint]];
  return <div className="nexo-reading-switch">
    <span id="nexo-reading-label">{labels.label}</span>
    <div className="atlas-seg" role="group" aria-labelledby="nexo-reading-label">
      {options.map(([value, label, hint]) => <button key={value} type="button" aria-pressed={mode === value} title={hint} onClick={() => setReadingMode(value)}>{label}</button>)}
    </div>
  </div>;
}
