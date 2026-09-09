from pathlib import Path
import re, sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
codep=root/'atlas-control-tower/apps-script/Code.gs'
testp=root/'atlas-control-tower/test/drive-pages-cutover.test.mjs'
code=codep.read_text()
test=testp.read_text()

# Add regression tests first (RED on old compiler).
anchor="test('snapshot contract exposes hierarchy, provenance and Present from one truth', async () => {"
newtests=r'''test('compiler preserves multi-action execution runs without creating orphan parents', () => {
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
if "compiler preserves multi-action execution runs" not in test:
    assert anchor in test
    test=test.replace(anchor,newtests+anchor)
testp.write_text(test)

# Integrity-safe compiler patch.
needle="  const olympusProjection = projectOlympus_(olympus, graph);\n\n  const atlasData = {"
if "const integrity = repairGraphIntegrity_(graph);" not in code:
    assert needle in code
    code=code.replace(needle,"  const olympusProjection = projectOlympus_(olympus, graph);\n  const integrity = repairGraphIntegrity_(graph);\n\n  const atlasData = {")
code=code.replace("    edges: stableSortEdges_(dedupeEdges_(graph.edges)),","    edges: stableSortEdges_(integrity.validEdges),")
if "integrity: {orphanEdges: integrity.orphanEdges, reparentedNodes: integrity.reparentedNodes}," not in code:
    code=code.replace("    olympus: olympusProjection.summary,\n    systemState:","    olympus: olympusProjection.summary,\n    integrity: {orphanEdges: integrity.orphanEdges, reparentedNodes: integrity.reparentedNodes},\n    systemState:")

new_ops=r'''function projectOperations_(book, g) {
  const actions=readTable_(book,'ACTION_INDEX'), runs=readTable_(book,'EXECUTION_RUNS'), signals=readTable_(book,'SIGNAL_LEDGER'), effects=readTable_(book,'EFFECT_LEDGER'), relations=readTable_(book,'RELATION_LEDGER'), activity=[], records=[], actionNodeIds={};
  actions.forEach((row,i)=>{
    const raw=pick_(row,['action_id','Action ID']) || 'row-'+(i+2), id='action:'+token_(raw), n=node_(id,'OPERATION',pick_(row,['action','Ação','summary'])||raw,'system:OPERATIONS',pick_(row,['domain'])||'OPERATIONS',pick_(row,['status'])||'UNKNOWN',pick_(row,['inference_basis','next_action','summary'])||'');
    n.activityAt=pick_(row,['last_checked'])||''; n.authority='OPERATIONS_CANONICAL'; n.sourceRefs=[ref_('GOOGLE_DRIVE','ACTION_INDEX',raw)]; g.addNode(n); actionNodeIds[id]=true; g.addEdge('system:OPERATIONS',id,'CONTAINS','OPERATIONS_CANONICAL'); records.push(compactRecord_('ACTION_INDEX',row));
  });
  runs.forEach((row,i)=>{
    const raw=pick_(row,['run_id','Run ID']) || 'row-'+(i+2), id='run:'+token_(raw), actionRaws=splitIds_(pick_(row,['action_id','Action ID'])), parentIds=actionRaws.map(value=>'action:'+token_(value)).filter(value=>actionNodeIds[value]), parent=parentIds[0]||'system:OPERATIONS', n=node_(id,'RUN',pick_(row,['title','run_type','operation'])||raw,parent,pick_(row,['domain'])||'OPERATIONS',pick_(row,['status','outcome'])||'UNKNOWN',pick_(row,['summary','result_summary','message'])||'');
    n.actionIds=actionRaws; n.activityAt=pick_(row,['finished_at','observed_at','started_at','timestamp'])||''; n.authority='OPERATIONS_CANONICAL'; n.sourceRefs=[ref_('GOOGLE_DRIVE','EXECUTION_RUNS',raw)]; g.addNode(n); g.addEdge(parent,id,'EXECUTED_AS','OPERATIONS_CANONICAL'); parentIds.slice(1).forEach(extra=>g.addEdge(extra,id,'ALSO_EXECUTED_AS','OPERATIONS_CANONICAL')); records.push(compactRecord_('EXECUTION_RUNS',row)); activity.push({entityId:id,at:n.activityAt,summary:n.summary,source:'NEXO ACTION_REGISTER/EXECUTION_RUNS'});
  });
  records.push(...signals.map(r=>compactRecord_('SIGNAL_LEDGER',r)),...effects.map(r=>compactRecord_('EFFECT_LEDGER',r)),...relations.map(r=>compactRecord_('RELATION_LEDGER',r)));
  return {records,activity};
}'''
code, n = re.subn(r"function projectOperations_\(book, g\) \{.*?\n\}\n\n(?=function projectOlympus_)",new_ops+"\n\n",code,flags=re.S)
assert n==1, n

integrity_funcs=r'''function repairGraphIntegrity_(graph) {
  const ids={}; graph.nodes.forEach(n=>{if(n&&n.id)ids[n.id]=true});
  const reparentedNodes=[];
  graph.nodes.forEach(n=>{
    if(!n||!n.parentId||ids[n.parentId])return;
    const originalParentId=n.parentId, fallback=fallbackParent_(n);
    n.parentId=fallback; n.integrity=Object.assign({},n.integrity||{},{reparentedFrom:originalParentId});
    reparentedNodes.push({nodeId:n.id,originalParentId,fallbackParentId:fallback});
    if(fallback&&ids[fallback])graph.addEdge(fallback,n.id,'CONTAINS','INTEGRITY_FALLBACK',originalParentId);
  });
  const validEdges=[], orphanEdges=[];
  dedupeEdges_(graph.edges).forEach(e=>{
    if(ids[e.source]&&ids[e.target])validEdges.push(e);
    else orphanEdges.push(Object.assign({},e,{reason:!ids[e.source]&&!ids[e.target]?'MISSING_SOURCE_AND_TARGET':(!ids[e.source]?'MISSING_SOURCE':'MISSING_TARGET')}));
  });
  return {validEdges,orphanEdges,reparentedNodes};
}

function fallbackParent_(node) {
  if(node.domain==='OLYMPUS'||String(node.id||'').indexOf('olympus-')===0)return'system:OLYMPUS';
  if(['OPERATION','RUN'].includes(node.type))return'system:OPERATIONS';
  if(['MEMORY','POLICY','STRATEGY','SKILL','LEARNING'].includes(node.type)||String(node.id||'').indexOf('learning:')===0||String(node.id||'').indexOf('learning-concept:')===0)return'system:LEARNING';
  return'system:SCIENCE';
}

'''
if 'function repairGraphIntegrity_' not in code:
    assert 'function buildLineage_(atlas) {' in code
    code=code.replace('function buildLineage_(atlas) {', integrity_funcs+'function buildLineage_(atlas) {')

codep.write_text(code)
