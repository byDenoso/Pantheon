// Private legacy Atlas shell build. Output goes ONLY to server/private-ui (served after auth by
// /api/atlas-private-ui and /api/atlas-private-assets/*). Never the public dist.
import {defineConfig, type Plugin} from 'vite';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname);
export const PRIVATE_BASE = '/api/atlas-private-assets/';

/** Module swaps applied by resolved path, so every import spelling is covered. */
const swaps: Record<string, string> = {
  'src/data/adapters/index.ts': 'src/private-legacy/adapters.ts',
  'src/data/fixtures/scenarios.ts': 'src/private-legacy/scenarios.ts',
  'src/data/projectionSync.ts': 'src/private-legacy/projectionSync.ts',
  'src/app/useSession.ts': 'src/private-legacy/useSession.ts',
  'src/atlas3d/g6-loader.ts': 'src/private-legacy/g6-loader.ts',
  'src/mcp/client.ts': 'src/private-legacy/mcpClient.ts',
};
const abs = new Map(Object.entries(swaps).map(([a, b]) => [resolve(root, a), resolve(root, b)]));

type Pair = [from: string, to: string];
/** Literal replacements; the build fails loudly when a legacy text changed and an adaptation no longer applies. */
export function replaceLiterals(code: string, pairs: Pair[], file: string): string {
  let out = code;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) throw new Error(`${file} changed: private adaptation no longer applies (${from.slice(0, 60)})`);
    out = out.split(from).join(to);
  }
  return out;
}

const PRIVATE_RUNTIME = 'NEXO_ATLAS_PRIVATE_RUNTIME_V1';

/**
 * Build-time adaptations of legacy modules (visual code untouched). PRIVATE data is never relabelled PUBLIC:
 *  - galaxy observation parser: opaque revision/fingerprints (bound to the generation fingerprint, now mandatory),
 *    PRIVATE access + private runtime source_contract instead of PUBLIC/TOWER_V06 authority (none is invented)
 *  - store: private publication contract
 *  - recall / MCP panel / sync messages: local-snapshot semantics, no network
 *  - galaxy route: the legacy route guard was hard-wired off; restore only the private #/galaxia entry
 */
export const adaptations: Record<string, (code: string) => string> = {
  '/src/data/atlasObservation.ts': code => replaceLiterals(code, [
    ['const TOWER_REVISION = /^[0-9a-f]{40}$/i;', 'const TOWER_REVISION = /^\\S{1,512}$/;'],
    ['const SHA256 = /^sha256:[0-9a-f]{64}$/i;', 'const SHA256 = /^\\S{1,512}$/;'],
    ["access: 'PUBLIC_PROJECTION',", "access: 'PRIVATE_RUNTIME',"],
    ["if (provenance?.authority !== 'TOWER_V06' || !sourceFingerprint || !SHA256.test(sourceFingerprint)) {",
      `if (snapshot.access !== 'PRIVATE' || provenance?.source_contract !== '${PRIVATE_RUNTIME}' || !sourceFingerprint || !SHA256.test(sourceFingerprint)) {`],
    ['if (expectedFingerprint && sourceFingerprint.toLowerCase() !== expectedFingerprint.toLowerCase()) {',
      'if (!expectedFingerprint || sourceFingerprint.toLowerCase() !== expectedFingerprint.toLowerCase()) {'],
    ["provenance: { ...provenance, authority: 'TOWER_V06', source_fingerprint: sourceFingerprint },", 'provenance: { ...provenance, source_fingerprint: sourceFingerprint },'],
  ], 'atlasObservation.ts'),
  '/src/data/NexoStore.tsx': code => replaceLiterals(code, [
    ["if(publication.contract!=='NEXO_PUBLIC_PROJECTION_PUBLICATION_V1'){",
      "if(publication.contract!=='NEXO_PRIVATE_PROJECTION_PUBLICATION_V1'||publication.access!=='PRIVATE'){"],
  ], 'NexoStore.tsx'),
  '/src/features/Workspace.tsx': code => "import {privateRecall} from '../private-legacy/recall.ts';\n" + replaceLiterals(code, [
    ['fetch(`/api/recall?q=${encodeURIComponent(query)}`,{signal:ctrl.signal})', 'privateRecall(query,ctrl.signal)'],
    ['Busca lexical em Drive, Gmail e GitHub; consulta aos registros de NEXO e Atlas disponíveis. Resultados preservam a origem.',
      'PRIVATE · busca lexical local no snapshot da geração autenticada (world.items). Nada é enviado nem consultado em fontes externas; fonte ausente do runtime aparece como indisponível.'],
  ], 'Workspace.tsx'),
  '/src/mcp/McpControlPanel.tsx': code => replaceLiterals(code, [
    ['Interface programática do NEXO. O console consulta as ferramentas públicas do servidor.',
      'PRIVATE · consultas locais da geração autenticada + retrieval remoto read-only pela ponte protegida do parent. O iframe continua sem acesso direto à rede.'],
    ['<h3>Servidor <StatusBadge', '<h3>Consultas locais <StatusBadge'],
    ['status.status!==\'READY\'&&<p role="status">Fonte científica indisponível. As políticas continuam disponíveis.</p>',
      '<p role="status">PRIVATE · snapshot local + retrieval remoto read-only quando configurado; tokens e credenciais ficam somente no servidor.</p>'],
    ['Telemetria indisponível nesta versão do servidor. O tempo de execução de cada consulta é medido pelo console.',
      'Telemetria do snapshot local não se aplica; chamadas de retrieval remoto preservam o resultado estruturado e o tempo é medido pelo console.'],
  ], 'McpControlPanel.tsx'),
  '/src/data/useSystem.ts': code => replaceLiterals(code, [
    ["'Disparando sincronização real…'", "'Revalidando a sessão e buscando nova geração privada…'"],
    ["'Dispatch aceito · aguardando publicação…'", "'Nova geração recebida · validando…'"],
    ["'Publicação confirmada · atualizando estado…'", "'Nova geração validada · atualizando estado…'"],
    ["changed ? 'Nova projeção publicada' : 'Sem alterações · sincronização concluída'", "changed ? 'Nova geração privada recebida' : 'Mesma geração · sem alterações'"],
  ], 'useSystem.ts'),
  '/src/app/App.tsx': code => replaceLiterals(code, [
    ['const isGalaxyRoute = (_hash: string) => false;', 'const isGalaxyRoute = (hash: string) => /^#\\/galaxia(?:[/?]|$)/.test(hash);'],
  ], 'App.tsx'),
};

/** Kept for tests: the original observation-only adaptation entry point. */
export const adaptObservation = adaptations['/src/data/atlasObservation.ts']!;

export const privateSwap = (): Plugin => ({
  name: 'atlas-private-swap',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (source.startsWith('\0')) return null;
    const r = await this.resolve(source, importer, {...options, skipSelf: true});
    return r && abs.has(r.id) ? abs.get(r.id)! : null;
  },
  transform(code, id) {
    const file = id.split('?')[0]!;
    for (const [suffix, fn] of Object.entries(adaptations)) if (file.endsWith(suffix)) return {code: fn(code), map: null};
    return null;
  },
});

// Public/build-time endpoints and bridges must not be inlined from a developer .env.
const blank = ['VITE_NEXO_AUTH_BRIDGE_URL', 'VITE_PRIVATE_COCKPIT_URL', 'VITE_NEXO_FORCE_SYNC_URL', 'VITE_WORLD_ENDPOINT', 'VITE_SYSTEM_ENDPOINT',
  'VITE_SYSTEM_SOURCE', 'VITE_NEXO_SYNC_ENDPOINT', 'VITE_GALAXY_ENDPOINT', 'VITE_MCP_ENDPOINT', 'VITE_VERCEL_ANALYTICS_ID'];

export default defineConfig(({mode}) => ({
  root: resolve(root, 'private-ui'),
  base: PRIVATE_BASE,
  publicDir: false,
  envDir: false as unknown as string,
  define: Object.fromEntries(blank.map(k => [`import.meta.env.${k}`, '""'])),
  plugins: [privateSwap()],
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: process.env.ATLAS_PRIVATE_OUT ? resolve(process.env.ATLAS_PRIVATE_OUT) : resolve(root, 'server/private-ui'),
    emptyOutDir: true,
    modulePreload: {polyfill: false},
  },
  mode,
}));
