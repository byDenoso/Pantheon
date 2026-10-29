// Local server for investigation-page QA: the REAL application entry served by Vite,
// with the five editorial catalogs swapped for the SYNTHETIC ones and the three public
// API routes answered in-process. No Worker, Tower, credentials or published values.
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {guardVisual} from '../../src/atlas/publicVisuals.ts';
import {comparisonRevision} from '../../src/atlas/publicVisualGroups.ts';
import {makePublicStudyFixture, SYNTHETIC_STUDY_NOTICE} from './public-study.fixture.mjs';

export async function startStudyServer({port = 0} = {}) {
  const fixture = makePublicStudyFixture();
  const guarded = new Map(fixture.payload.visuals.map(raw => [raw.id, guardVisual(raw)]));
  assert.ok([...guarded.values()].every(Boolean), 'synthetic visuals must pass the public guard');
  // Same presentation checksum the application computes, so the synthetic groups are eligible.
  const comparisons = {contract: 'PUBLIC_VISUAL_COMPARISONS_V1', groups: fixture.comparisonSpec.map(group => ({...group, members: group.members.map(member => ({...member, revision: comparisonRevision(guarded.get(member.id))}))}))};
  const temp = await mkdtemp(join(tmpdir(), 'nexo-study-qa-'));
  const swapped = {
    'publicQuestionCatalog.json': fixture.catalogs.questionCatalog, 'publicQuestionAliases.json': fixture.catalogs.questionAliases,
    'publicStudyRoutes.json': fixture.catalogs.studyRoutes, 'publicCampaignCatalog.json': fixture.catalogs.campaignCatalog,
    'publicVisualComparisons.json': comparisons,
  };
  for (const [name, value] of Object.entries(swapped)) await writeFile(join(temp, name), JSON.stringify(value));
  const control = {payload: fixture.payload, publicDelayMs: 0};
  const synthetic = {name: 'synthetic-public-catalogs', enforce: 'pre',
    resolveId(source, importer) { const name = source.split('/').pop(); return importer && /\/src\/atlas\//.test(importer) && Object.hasOwn(swapped, name) ? join(temp, name) : null; },
    configureServer(server) { server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, 'http://localhost'); if (!url.pathname.startsWith('/api/')) return next();
      const json = (body, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
      if (url.pathname === '/api/atlas-public') { if (control.publicDelayMs) await new Promise(done => setTimeout(done, control.publicDelayMs)); return json(control.payload); }
      if (url.pathname === '/api/atlas-locale') return json({contract: 'ATLAS_LOCALE_V1', locale: url.searchParams.get('lang') || 'pt-BR', source: 'preference', supported: ['pt-BR', 'en']});
      if (url.pathname === '/api/atlas-access') return json({signedIn: false, owner: false, setupRequired: false});
      return json({error: 'NOT_FOUND'}, 404);
    }); }};
  const server = await createServer({root: process.cwd(), cacheDir: join(temp, '.vite'), logLevel: 'error', plugins: [synthetic], server: {host: '127.0.0.1', port, fs: {allow: [process.cwd(), temp]}}});
  await server.listen();
  return {origin: `http://127.0.0.1:${server.httpServer.address().port}`, fixture, comparisons, control, notice: SYNTHETIC_STUDY_NOTICE,
    async close() { await server.close(); await rm(temp, {recursive: true, force: true}); }};
}

// `node test/helpers/public-study-server.mjs 5199` keeps the synthetic site up for manual review.
if (import.meta.url === `file://${process.argv[1]}`) { const s = await startStudyServer({port: Number(process.argv[2]) || 5199}); console.log(`${s.notice}\n${s.origin}`); }
