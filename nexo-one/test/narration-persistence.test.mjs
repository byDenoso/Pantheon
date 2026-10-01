import test from 'node:test';
import assert from 'node:assert/strict';
import { NARRATION } from '../src/features/lab/narration.ts';
import { createPersistentNarrationDeck, NARRATION_STORAGE_KEY, NARRATION_CURSOR_VERSION } from '../src/features/lab/narration-deck.ts';
const storage = () => { const entries = new Map(); return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) }; };

test('reload keeps the permutation cursor and avoids repeating phrases for the same receipt', () => {
  const local = storage();
  const first = createPersistentNarrationDeck(local, () => 'firstseed');
  const line1 = first.say('BOARD_POSTED', 'real-receipt-1');
  assert.equal(first.say('BOARD_POSTED', 'real-receipt-1'), line1);
  const second = createPersistentNarrationDeck(local, () => 'newseedignored');
  const line2 = second.say('BOARD_POSTED', 'real-receipt-1');
  assert.notEqual(line1, line2);
  const third = createPersistentNarrationDeck(local, () => 'anotherseedignored');
  const line3 = third.say('BOARD_POSTED', 'real-receipt-1');
  assert.equal(new Set([line1, line2, line3]).size, 3);
  assert.equal(third.persistence, 'local');
});

test('the full 14400-pair family cycle remains unique across simulated reloads', () => {
  const local = storage(); const seen = new Set();
  for (let reload = 0; reload < 120; reload++) {
    const deck = createPersistentNarrationDeck(local, () => 'stable');
    for (let receipt = 0; receipt < 120; receipt++) {
      const line = deck.say('BOARD_POSTED', 'receipt:' + receipt);
      assert.ok(!seen.has(line), 'repeat at reload ' + reload);
      seen.add(line);
    }
  }
  assert.equal(seen.size, 14400);
});

test('storage is versioned, bounded and contains no receipt, actor, claim or text', () => {
  const local = storage(); const deck = createPersistentNarrationDeck(local, () => 'safeSeed1');
  for (const family of Object.keys(NARRATION)) deck.say(family, 'private-receipt', { title: 'private scientific claim', n: 99 });
  const raw = local.getItem(NARRATION_STORAGE_KEY);
  const saved = JSON.parse(raw);
  assert.equal(saved.version, NARRATION_CURSOR_VERSION);
  assert.equal(saved.matrixSize, 120);
  assert.deepEqual(Object.keys(saved).sort(), ['cursors', 'matrixSize', 'seed', 'version']);
  assert.equal(Object.keys(saved.cursors).length, 32);
  assert.ok(raw.length < 3000);
  assert.doesNotMatch(raw, /private-receipt|private scientific claim|Registrei|EXECUTOR/);
  assert.equal(deck.say('constructor', 'receipt'), null);
});

test('wrong version, matrix or invalid cursors reset to a safe current state', () => {
  for (const patch of [{ version: 0 }, { matrixSize: 90 }, { seed: 'bad token with spaces' }, { cursors: { BOARD_POSTED: -1 } }, { cursors: { BOARD_POSTED: 14400 } }, { cursors: { UNKNOWN_FAMILY: 1 } }]) {
    const local = storage();
    local.setItem(NARRATION_STORAGE_KEY, JSON.stringify({ version: 1, matrixSize: 120, seed: 'oldseed', cursors: { BOARD_POSTED: 11 }, ...patch }));
    const deck = createPersistentNarrationDeck(local, () => 'resetseed');
    assert.equal(deck.persistence, 'local');
    assert.equal(deck.counters.BOARD_POSTED, undefined);
    const saved = JSON.parse(local.getItem(NARRATION_STORAGE_KEY));
    assert.equal(saved.seed, 'resetseed');
    assert.equal(saved.version, 1);
    assert.deepEqual(saved.cursors, {});
  }
});

test('corrupt JSON, unavailable reads and quota failures fall back without throwing or storing data', () => {
  const corrupt = storage(); corrupt.setItem(NARRATION_STORAGE_KEY, '{');
  const blockedRead = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('unreachable'); } };
  const quota = { getItem() { return null; }, setItem() { throw new Error('QuotaExceededError'); } };
  for (const local of [corrupt, blockedRead, quota, undefined]) {
    const deck = createPersistentNarrationDeck(local, () => 'memoryseed');
    assert.equal(deck.persistence, 'memory');
    const line = deck.say('BOARD_POSTED', 'a');
    assert.equal(deck.say('BOARD_POSTED', 'a'), line);
    assert.notEqual(deck.say('BOARD_POSTED', 'b'), line);
  }
});

test('a later quota failure keeps the current in-memory permutation running', () => {
  const local = storage(); const original = local.setItem; let fail = false;
  local.setItem = (key, value) => { if (fail) throw new Error('QuotaExceededError'); original(key, value); };
  const deck = createPersistentNarrationDeck(local, () => 'seed');
  const first = deck.say('BOARD_POSTED', 'first'); fail = true;
  const second = deck.say('BOARD_POSTED', 'second');
  assert.notEqual(first, second);
  assert.equal(deck.persistence, 'memory');
  assert.equal(deck.say('BOARD_POSTED', 'second'), second);
});
