import plain from './publicPlain.json' with {type: 'json'};
import type {Bilingual} from './publicItems.ts';

// Plain-language restatements of the reviewed summaries in publicCampaignCatalog.json,
// for the "from scratch" reading level. Each one says what the summary says with
// fewer terms; none adds a number, a claim or a conclusion. Keyed like the catalog.
const entries = plain as Record<string, Bilingual>;
export const plainSummary = (groupId: string): Bilingual | null => entries[groupId.replace(/^question-/, '')] ?? null;
