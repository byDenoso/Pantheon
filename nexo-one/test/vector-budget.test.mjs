import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/features/lab/vector-budget.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, {exports});
const {environmentStride, ENVIRONMENT_POINT_BUDGET} = exports;

for (const quality of ['low', 'medium', 'high']) {
  test(`${quality}: empty, small, boundary and million-particle inputs stay bounded`, () => {
    const budget = ENVIRONMENT_POINT_BUDGET[quality];
    const baseline = quality === 'low' ? 3 : quality === 'medium' ? 2 : 1;
    for (const count of [0, 1, 100, budget - 1, budget, budget + 1, budget * baseline, budget * baseline + 1, 88_966, 1_000_003]) {
      const stride = environmentStride(count, quality);
      assert.ok(Number.isSafeInteger(stride) && stride >= baseline);
      assert.ok(Math.ceil(count / stride) <= budget, `${count} exceeds ${budget}`);
      if (count <= budget * baseline) assert.equal(stride, baseline, 'small scenes retain their original density');
    }
  });
}
test('invalid counts fail explicitly', () => {
  for (const count of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => environmentStride(count, 'low'), error => error.name === 'RangeError');
  }
});
