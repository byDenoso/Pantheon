# Public research continuity and rendering optimization

User approval: 2026-10-09. Base Site49 commit67e732c69449280dba5c1f5d0d4566f369be2171.

## Delivered scope
- Existing public question URLs now present dedicated investigation pages, with a specific H1/document title, summary, limits, associated tests, methodology and return link. No new scientific content.
- Public UI state (tab, query, topic, selected question, pagination, comparison and catalog-open state) is scoped to sessionStorage. No research payload, authentication material or private content is stored by this mechanism.
- Returning to the catalog restores its filters and scroll position. Direct section navigation from a study page remains usable.
- Closed catalog, associated-test details and technical plot details mount on demand. First-open rendering is retained where necessary to preserve controls.
- Pointer work is limited to reactive surfaces; pending hover callbacks are canceled on leave. MatchMedia instances and numeric formatters are reused; unchanged nearest-point selection does not rerender.
- Fallback canvas now observes the shared animation-pause state. Existing reduced-motion, visibility and cleanup behavior remains.
- Selected map number contrast strengthened, singular count fixed, and public update times explicitly label UTC−03:00.

## Measurements
Baseline live homepage with closed catalog:132 study views,54 summary figures,54 detailed SVG plots already mounted. Baseline gallery adds6 further summary/detailed pairs.

In-memory pointer harness:60 moves outside reactive surfaces formerly scheduled60 RAF callbacks and created60 media-query objects; corrected implementation schedules0 and creates0 after initialization. Leaving before the pending frame no longer restores hover. These are operation counts, not measured browser FPS or a claim of a quantified speedup.

Final browser counts and navigation verification are recorded in the delivery. Public polling, public data and private backend were preserved.

## Limits
Available cloud browser is Linux Chromium. No real Safari/iPhone runtime is exposed. Managed DevTools emulation was blocked by organization policy and was not bypassed. Source and software tests verify reduced-motion handling; native OS preference emulation remains unverified in that browser environment.

Measured React render regression: fresh ready homepage now mounts 0 study views,0 summary figures and0 detailed SVG plots/tables. Opening the catalog mounts8 question overviews, with nested test bodies deferred until requested. Disclosure lifecycle checks verify the bodies appear on first open and stay mounted across close/reopen; content is deferred, not deleted. The selected light-mode map numeral was changed from the failing4.42:1 accent to the main foreground color. Method step headings now use H2 below H1.
