from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=root/'atlas-control-tower/test/drive-pages-cutover.test.mjs'
s=p.read_text()
anchor="test('snapshot contract exposes hierarchy, provenance and Present from one truth', async () => {"
mode=sys.argv[2] if len(sys.argv)>2 else 'integrity'
if mode=='integrity':
    block=r'''test('compiler preserves multi-action execution runs without creating orphan parents', () => {
  const code = text('apps-script','Code.gs');
  assert.match(code, /actionNodeIds=\{\}/);
  assert.match(code, /actionRaws=splitIds_\(pick_\(row,\['action_id','Action ID'\]\)\)/);
  assert.match(code, /ALSO_EXECUTED_AS/);
  assert.match(code, /parentIds\[0\]\|\|'system:OPERATIONS'/);
});

test('compiler quarantines stale Drive relations instead of breaking the published graph', () => {
  const code = text('apps-script','Code.gs');
  assert.match(code, /function repairGraphIntegrity_\s*\(/);
  assert.match(code, /orphanEdges/);
  assert.match(code, /reparentedNodes/);
  assert.match(code, /INTEGRITY_FALLBACK/);
  assert.match(code, /integrity: \{orphanEdges: integrity\.orphanEdges, reparentedNodes: integrity\.reparentedNodes\}/);
});

'''
    marker='compiler preserves multi-action execution runs'
elif mode=='compact':
    block=r'''test('compiled static projection avoids duplicating graph truth across envelopes', () => {
  const code = text('apps-script','Code.gs');
  assert.match(code, /graph\.nodes\.map\(compactAtlasNode_\)/);
  assert.match(code, /integrity\.validEdges\.filter\(e=>e\.type!=='CONTAINS'\)/);
  assert.match(code, /relations:\{source:'atlas\.data\.edges'\}/);
  assert.match(code, /provenance:\{source:'atlas\.data\.nodes\[\*\]\.sourceRefs'\}/);
  assert.match(code, /JSON\.stringify\(item\[1\]\)\+'\\n'/);
});

'''
    marker='compiled static projection avoids duplicating graph truth'
else:
    raise SystemExit('unknown mode')
if marker not in s:
    assert anchor in s
    p.write_text(s.replace(anchor,block+anchor))
