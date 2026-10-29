import {createHash} from 'node:crypto';
import history from './public-publication.json' with {type:'json'};
export function publicationKey(row) {
  const content = Object.fromEntries(['question','answers','method','result'].map(key=>[key,{'pt-BR':row[key]['pt-BR'],en:row[key].en}]));
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}
export function publicationDates(row, records = history.records) {
  const record = records[publicationKey(row)];
  // A changed text cannot silently inherit an unrelated publication date.
  if (!record) return {published_at:null,updated_at:null};
  const parse = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value)<=Date.now() ? new Date(value).toISOString() : null;
  const published_at=parse(record.published_at), updated_at=parse(record.updated_at);
  return {published_at,updated_at:updated_at && (!published_at || updated_at>=published_at) ? updated_at : null};
}
