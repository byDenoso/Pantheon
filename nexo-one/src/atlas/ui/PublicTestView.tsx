import type {Locale} from '../api.ts';
import {pick, type PublicTest} from '../publicItems.ts';
import {PRESENTATION} from '../../i18n/presentation.ts';

/** Four reviewed fields only. No operational status is interpreted as a scientific result. */
export default function PublicTestView({test, locale}: {test: PublicTest; locale: Locale}) {
  const labels = PRESENTATION[locale].test;
  return (
    <article className="atlas-public-test" aria-label={pick(test.question, locale)}>
      <dl>
        <div><dt>{labels.question}</dt><dd><h3>{pick(test.question, locale)}</h3></dd></div>
        <div><dt>{labels.answers}</dt><dd>{pick(test.answers, locale)}</dd></div>
        <div><dt>{labels.method}</dt><dd>{pick(test.method, locale)}</dd></div>
        <div><dt>{labels.result}</dt><dd>{pick(test.result, locale)}</dd></div>
      </dl>
    </article>
  );
}
