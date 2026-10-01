import { NARRATION, NARRATION_MATRIX_SIZE } from './narration.ts';

export const NARRATION_STORAGE_KEY = 'nexo.narration.cursor.v1';
export const NARRATION_CURSOR_VERSION = 2;
type CursorStorage = Pick<Storage, 'getItem' | 'setItem'>;
const families = Object.keys(NARRATION);

const hash = (value: string): number => {
  let out = 2166136261;
  for (const char of value) out = Math.imul(out ^ char.charCodeAt(0), 16777619);
  return out >>> 0;
};
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;

const supported = (template: string, vars: Record<string, string | number>) =>
  [...template.matchAll(/\{(\w+)\}/g)].every(([, name]) => {
    const value = vars[name!];
    return typeof value === 'string' ? value.trim().length > 0 : typeof value === 'number' && Number.isFinite(value);
  });

/** Permute only factual, supported pairs. The same receipt and field coverage stay stable in a visit. */
export function createNarrationDeck(salt: string, initial: Record<string, number> = {}, advance?: (cursors: Record<string, number>) => void) {
  const counters = { ...initial };
  const cache = new Map<string, string>();
  return {
    counters,
    say(key: string, receipt: string, vars: Record<string, string | number> = {}): string | null {
      const matrix = Object.hasOwn(NARRATION, key) ? NARRATION[key] : undefined;
      if (!matrix) return null;
      const heads = matrix.heads.filter(head => supported(head, vars));
      if (!heads.length) return null;
      const eligible = matrix.tails.map((tail, i) => supported(tail, vars) ? i : -1).filter(i => i >= 0);
      const tails = eligible.length ? eligible.map(i => matrix.tails[i]!) : [''];
      const cacheKey = `${key}\u0000${receipt}\u0000${eligible.join(',')}`;
      let template = cache.get(cacheKey);
      if (!template) {
        const size = heads.length * tails.length;
        let stride = 137;
        while (gcd(stride, size) !== 1) stride += 2;
        const used = Math.max(0, Math.floor(counters[key] ?? 0));
        const index = (hash(`${salt}:${key}`) % size + used * stride) % size;
        template = heads[Math.floor(index / tails.length)]! + tails[index % tails.length]!;
        if (!eligible.length) template += '.';
        counters[key] = (used + 1) % (NARRATION_MATRIX_SIZE ** 2);
        // Receipt IDs/text are never persisted. Bound even this visit-only stability cache.
        if (cache.size >= 512) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, template);
        advance?.(counters);
      }
      return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(vars[name] ?? ''));
    },
  };
}

/** Store only a non-secret permutation seed and bounded integer cursors, never receipt IDs or text. */
export function createPersistentNarrationDeck(storage?: CursorStorage, makeSeed = () => Math.random().toString(36).slice(2)) {
  let seed = makeSeed();
  let cursors: Record<string, number> = {};
  let persistence: 'local' | 'memory' = storage ? 'local' : 'memory';
  if (storage) {
    try {
      const raw = storage.getItem(NARRATION_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { version?: unknown; matrixSize?: unknown; seed?: unknown; cursors?: unknown };
        const validSeed = typeof saved.seed === 'string' && /^[a-z0-9]{1,64}$/i.test(saved.seed);
        const validCursors = saved.cursors && typeof saved.cursors === 'object' && !Array.isArray(saved.cursors)
          && Object.keys(saved.cursors).length <= families.length
          && Object.entries(saved.cursors).every(([family, cursor]) => Object.hasOwn(NARRATION, family)
            && typeof cursor === 'number' && Number.isInteger(cursor) && cursor >= 0 && cursor < NARRATION_MATRIX_SIZE ** 2);
        if (saved.version === NARRATION_CURSOR_VERSION && saved.matrixSize === NARRATION_MATRIX_SIZE && validSeed && validCursors) {
          seed = saved.seed as string;
          cursors = saved.cursors as Record<string, number>;
        }
      }
    } catch { persistence = 'memory'; }
  }
  const save = (current: Record<string, number>) => {
    if (!storage || persistence === 'memory') return;
    try { storage.setItem(NARRATION_STORAGE_KEY, JSON.stringify({ version: NARRATION_CURSOR_VERSION, matrixSize: NARRATION_MATRIX_SIZE, seed, cursors: current })); }
    catch { persistence = 'memory'; }
  };
  // An invalid version/value is replaced. A parse/read failure uses the in-memory fallback.
  save(cursors);
  const deck = createNarrationDeck(seed, cursors, save);
  return { ...deck, get persistence() { return persistence; } };
}

export function browserNarrationDeck() {
  try { return createPersistentNarrationDeck(typeof localStorage === 'undefined' ? undefined : localStorage); }
  catch { return createPersistentNarrationDeck(); }
}
