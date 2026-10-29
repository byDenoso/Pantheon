# Public figure comparisons

The full public gallery presents 72 original scientific visuals as 37 figures,
covering 71 distinct public analyses and 73 original points. The coordinate
conversion analysis has two different metric plots and therefore counts once as
an analysis. Each original visual occurs exactly once in the gallery grouping.
Compact figures inside individual studies retain the original presentation.

## Reviewed compatibility

`src/atlas/publicVisualComparisons.json` is a presentation-only, explicitly
reviewed assignment catalog. It does not publish new results or alter an API,
canonical record, approval, authentication rule or public sanitization boundary.
Its 15 comparison panels contain 50 original visuals; the other 22 stay single.

- Prior sensitivity with BAO+CMB: 18 visuals become four panels, separated by the
  exact compilation ensemble in the question. Priors, their widths, full bin
  partitions, the winning dataset and removed bin remain explicit in every row.
- Sensitivity with only BAO stated fixed: 16 visuals become nine panels. Ten
  known-prior entries form three panels by compilation ensemble; all six cases
  without a published prior remain separate. CMB treatment is not inferred.
- Bin sensitivity with BAO+CMB: 16 visuals become six panels. Four shared full
  partitions form comparisons; two unique partitions remain separate. Three
  explicitly recorded same-design repeats remain labeled and retained.
- DESI DR1 full-shape point comparisons: nine visuals become five panels, split
  by exact tracer and effective redshift. The cosmological point differs; the
  published reference-minus-alternative sign and original verdicts are retained.
- All five fixed-expansion growth results stay separate. Their public summaries
  do not establish the dataset release, and their model/reference roles differ
  from the DESI point comparisons. The three-redshift LRG entries stay scalar.
- All other metrics remain separate, including angular error versus correlation,
  nominal significance, energy scale, algebraic ratio and interval estimate.

These are descriptive comparisons of methods as stated in public summaries,
not a claim that unpublished protocols are equivalent. Percentage panels show
analysis-specific maxima relative to each analysis's own fit-improvement
reference; the absolute denominators are absent from the public summaries.
This qualification is visible above each chart. No averaging, pooling, inferred
uncertainty, connecting line or additional significance is introduced.

## Fail-safe updates and source retention

Assignments bind the final endpoint projection, after campaign, editorial, visual
and cosmology projections and the client guard. They do not bind the earlier
pre-cosmology source wording. An integration regression exercises the actual
Worker endpoint and client guard before asserting 72 → 37.

Every assignment is tied to a deterministic checksum of the complete guarded
public visual, including both languages, question, method, answers, result,
axes, values, caption, limits, sources and dates. This checksum is only a
presentation revision detector, never a security or approval mechanism. Unknown,
edited or incomplete records fall back to their original single-figure form.
A comparison left with one member also falls back to that original. Do not
automatically regenerate the catalog when source content changes: re-review the
scientific configuration before adding or updating an assignment.

Only categorical display x positions are numbered anew. Original objects and
source x values remain untouched. CSVs include configuration, original x,
display category, values, all four public source fields, caption, limitations,
source URLs and investigation route. Grouped SVGs carry the complete unchanged
original visuals in metadata and a visible configuration key, qualification and
source-route mapping, so attribution survives ordinary image viewing. The
accessible table and per-source disclosures retain every source value, date,
question, method, caption, conclusion, limitation and link.

Search checks every member's configuration and public text, retaining complete
comparisons and reporting how many analyses actually matched. Gallery pages
contain at most six figures; counts distinguish figures from distinct source
analyses. Figures sort by their newest member's publication date. These dates
are publication metadata, not newly asserted execution dates.

## Verification

- `node --test test/public-visual-groups.test.mjs`
- `node test/public-visual-groups.render.mjs`
- `node test/summary-figures.render.mjs`
- `node test/public-visual-groups.browser.mjs` (requires a permitted Chromium
  environment; public-only fixtures, mobile/desktop and PT/EN checks)
- `node node_modules/typescript/bin/tsc --noEmit`
- `npm run build` followed by `npm test`
