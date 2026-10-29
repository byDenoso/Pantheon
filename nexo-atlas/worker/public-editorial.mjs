import copy from './public-editorial.json' with {type:'json'};
import {publicationKey} from './public-publication.mjs';
import {validatePublicTests} from './public-tests.mjs';

// A presentation-only revision tied to the exact previously public records.
// No scientific state, Writer approval, campaign binding or result is created.
export function publicEditorialProjection(payload) {
  if (!Array.isArray(payload.tests)) return payload;
  const tests = payload.tests.map(row => {
    const item = copy.records[publicationKey(row)];
    if (!item) throw new Error('PUBLIC_EDITORIAL_SOURCE_MISMATCH');
    const presentation = {
      question: {'pt-BR': row.question['pt-BR'], en: item.question},
      answers: {'pt-BR': row.answers['pt-BR'], en: item.answers},
      method: item.method,
      result: {'pt-BR': item.result_pt ?? row.result['pt-BR'], en: item.result},
    };
    const checked = validatePublicTests([presentation])[0];
    return {...checked, published_at: row.published_at, updated_at: item.updated_at ?? copy.updated_at};
  });
  return {...payload, tests};
}
