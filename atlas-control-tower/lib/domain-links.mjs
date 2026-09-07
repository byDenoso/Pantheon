/** Domain-to-domain links, counted from what the tests themselves declare.
 *
 *  A test that publishes `domains: ["D7","D3"]` is stating its own membership in
 *  both domains. Counting those co-declarations gives an honest link between two
 *  domains and a weight for it: how many tests declare both.
 *
 *  This is a reading of existing rows, not a new scientific claim. It does not
 *  assert that the domains are physically related, only that N registered tests
 *  declare themselves to belong to both. Authority stays DERIVED_NOT_EVIDENCE,
 *  and nothing here is inferred from titles, wording or similarity.
 */

export const DOMAIN_LINK_AUTHORITY = 'DERIVED_NOT_EVIDENCE';

/** Counts co-declared domain pairs across the tests in a graph.
 *  Returns [{a, b, tests}] with a < b, strongest first. */
export function domainCoDeclarations(nodes) {
 if (!Array.isArray(nodes)) return [];
 const counts = new Map();
 for (const node of nodes) {
  // only a TEST declares science-domain membership for itself
  if (node?.type !== 'TEST') continue;
  const declared = [...new Set(
   (Array.isArray(node.domains) ? node.domains : [])
    .map(d => (d == null ? '' : String(d).trim()))
    .filter(Boolean)
  )].sort();
  if (declared.length < 2) continue;
  for (let i = 0; i < declared.length; i++) {
   for (let j = i + 1; j < declared.length; j++) {
    const key = `${declared[i]}|${declared[j]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
   }
  }
 }
 return [...counts.entries()]
  .map(([key, tests]) => {const [a, b] = key.split('|'); return {a, b, tests}})
  .sort((x, y) => y.tests - x.tests || (x.a + x.b).localeCompare(y.a + y.b));
}
