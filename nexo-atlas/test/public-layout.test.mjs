import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/atlas/cinema/cinema.css',import.meta.url),'utf8');
const view=readFileSync(new URL('../src/atlas/ui/PublicApp.tsx',import.meta.url),'utf8');

test('public hero keeps research access without the universe explorer panel',()=>{
  assert.doesNotMatch(view,/CosmicExplorer|atlas-hero-art|Explore o Universo/);
  assert.match(view,/<ResearchLaunch pub=/);
});
test('hero uses one reading column after removing the explorer',()=>{
  const experience=readFileSync(new URL('../src/experience/experience.css',import.meta.url),'utf8');
  assert.match(experience,/\.atlas-public-main \.atlas-hero\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/\.atlas-hero-copy\{[\s\S]*?background:none/);
});
test('public sections share one reading surface without floating hero and section panels',()=>{
  assert.match(view,/<div className="atlas-public-content">/);
  assert.match(css,/\.atlas-public-content::before\{[\s\S]*?width:100vw/);
  assert.match(css,/\.atlas-hero-copy\{[\s\S]*?background:none;[\s\S]*?box-shadow:none/);
  assert.match(css,/\.atlas-public-main \.atlas-section\{[\s\S]*?background:none;[\s\S]*?margin:0/);
});
test('public responsive rules protect typography, controls and the unchanged media contract',()=>{
  assert.match(css,/font-size:clamp\(28px,7\.8vw,44px\)/);
  assert.match(css,/@media\(max-width:360px\)/);
  assert.match(css,/\.atlas-test-pagination\{flex-wrap:wrap\}/);
  assert.match(css,/\.nexo-cinema-backdrop\{position:fixed;[\s\S]*?pointer-events:none/);
  assert.match(css,/\.nexo-cinema-backdrop\[data-mode="video"\] \.nexo-cinema-video\{visibility:visible\}/);
  assert.match(css,/@media\(prefers-reduced-motion:no-preference\)/);
  assert.match(view,/usePublicResearch\(/);
  const monitor=readFileSync(new URL('../src/atlas/ui/usePublicResearch.ts',import.meta.url),'utf8');
  assert.match(monitor,/loadPublic\(/);
  // The full catalog lives in the research hub, as one of its views.
  const hub=readFileSync(new URL('../src/atlas/ui/PublicResearchHub.tsx',import.meta.url),'utf8');
  assert.match(hub,/<PublicTestList tests=\{pub\.tests\}/);
  assert.doesNotMatch(view,/nexo-study-catalog/);
});

test('shared hover feedback is bounded to fine pointers and respects reduced motion',()=>{
  const interaction=readFileSync(new URL('../src/styles/interactive-motion.css',import.meta.url),'utf8');
  assert.match(interaction,/@media\(hover:hover\) and \(pointer:fine\)/);
  assert.match(interaction,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(interaction,/transition:none!important;transform:none!important/);
  assert.match(interaction,/:focus-visible/);
  assert.match(interaction,/:active/);
  assert.match(interaction,/button:not\(:disabled\)/);
  for(const p of ['../src/main.tsx','../src/private-legacy/main.tsx']) assert.match(readFileSync(new URL(p,import.meta.url),'utf8'),/interactive-motion\.css/);
});
