import type {PublicState} from './publicItems.ts';
/** A missing reading is not a count of zero; partial counts name their scope. */
export function publicCount(pub:PublicState, count:number|undefined, en:boolean, analyses=false):string {
  if (pub.status === 'loading') return en?'Loading…':'Carregando…';
  if (pub.status === 'unavailable' || pub.coverage === 'UNAVAILABLE' || count === undefined) return en?'Unavailable':'Indisponível';
  // Owner-selected fronts list no tests of their own; their studies are counted separately (pub.tests).
  const partial = pub.coverage === 'PARTIAL' || (analyses && pub.campaigns?.some(c => c.testsCoverage !== 'COMPLETE' && (pub.selection !== 'LIVE' || c.tests.length > 0)));
  return partial ? `${count} ${en?'in this reading':'nesta leitura'}` : String(count);
}
