# NEXO 0.4.4 — cosmological motion

This visual correction continues the existing Sites project from c99cfc05f3ddffdc072bbbe9732e304e4ee78d8d, retaining the public summary figures and visitor interactions added in that revision.

References inspected in their official websites on 2026-10-09:

- No Man's Sky: https://www.nomanssky.com/ — large looping background film (the observed Vimeo embed specifies autoplay, background and loop).
- VALORANT: https://playvalorant.com/en-us/ — muted looping hero video, framed call to action and news-image zoom with a 0.3-second transform transition.
- Cyberpunk 2077: https://www.cyberpunk.net/us/en/cyberpunk-2077 — layered hero composition, looping background video and framed controls.

The NEXO implementation uses its existing illustrations, not game artwork or footage: continuous image movement, outward decorative lights and expanding rings in dark mode, a moving CMB illustration and orbital accents in light mode. The existing local visitor hook supplies bounded cursor depth, surface highlights and scroll reveals. Three hero shortcuts open the real question map, public figures and comparison views. The research section now follows the hero.

All animated layers honor the existing pause control, reduced-motion preference, hidden-tab state and hero visibility. Fine-pointer motion is local and uses no sensors, analytics or network calls. Mobile rendering bounds the number of decorative lights to 28 per scene. Translucency changes preserve text opacity and restore solid surfaces for increased-contrast preferences.

Counts and scientific values come from the existing public projection. Motion never changes a result, adds a scientific claim or grants review approval. The existing public summary figures preserve their PUBLISHED_SUMMARY labels and source bindings. Backend, authentication, MCP routes, scientific contracts, Tower, automations and private asset generation are unchanged. No dependency or paid service was added. Product version remains 0.4.4; there is no version-history footer.

Rollback: republish saved Sites version appgprj_6ac45767d678819182c86c56d11e0d37~appgver_a8d5340570c0819181577267390ee941, built from the baseline revision above, then verify the served assets and public projection again. DNS and runtime credentials do not need modification.
