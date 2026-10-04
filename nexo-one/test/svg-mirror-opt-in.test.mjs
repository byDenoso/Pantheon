import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022},
}).outputText;

function boot(search) {
  let tree;
  const loaded = [];
  const LazyMirror = Symbol('lazy SVG mirror');
  const jsx = (type, props) => ({type, props});
  const require = name => {
    loaded.push(name);
    if (name === 'react') return {Component: class {}, lazy: () => LazyMirror, Suspense: Symbol('Suspense')};
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx, Fragment: Symbol('Fragment')};
    if (name === 'react-dom/client') return {createRoot: () => ({render: element => { tree = element; }})};
    if (name.endsWith('webmcp.ts')) return {startWebMcp() {}};
    if (name.endsWith('NexoStore.tsx')) return {NexoStoreProvider: Symbol('Store')};
    return {default: Symbol(name)};
  };
  vm.runInNewContext(compiled, {exports: {}, require, URLSearchParams, window: {location: {search}}, document: {getElementById: () => ({})}});
  const find = node => {
    if (!node || typeof node !== 'object') return false;
    if (node.type === LazyMirror) return true;
    return [node.props?.children].flat().some(find);
  };
  return {mirrorMounted: find(tree), loaded};
}

for (const search of ['', '?svgMirror=0', '?readback=1', '?svgMirror=true']) {
  test(`normal boot does not mount or synchronously import a full-page mirror: ${search || '(none)'}`, () => {
    const result = boot(search);
    assert.equal(result.mirrorMounted, false);
    assert.equal(result.loaded.some(name => name.includes('TowerSVGSurface')), false);
  });
}
test('explicit svgMirror=1 mounts the diagnostic through a lazy boundary', () => {
  const result = boot('?svgMirror=1');
  assert.equal(result.mirrorMounted, true);
  assert.equal(result.loaded.some(name => name.includes('TowerSVGSurface')), false);
});
