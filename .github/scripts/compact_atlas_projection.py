from pathlib import Path
import re,sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
codep=root/'atlas-control-tower/apps-script/Code.gs'
testp=root/'atlas-control-tower/test/drive-pages-cutover.test.mjs'
code=codep.read_text(); test=testp.read_text()

# Add anti-sprawl contract test.
anchor="test('snapshot contract exposes hierarchy, provenance and Present from one truth', async () => {"
newtest=r'''test('compiled static projection avoids duplicating graph truth across envelopes', () => {
  const code = text('apps-script','Code.gs');
  assert.match(code, /graph\.nodes\.map\(compactAtlasNode_\)/);
  assert.match(code, /integrity\.validEdges\.filter\(e=>e\.type!=='CONTAINS'\)/);
  assert.match(code, /relations:\{source:'atlas\.data\.edges'\}/);
  assert.match(code, /provenance:\{source:'atlas\.data\.nodes\[\*\]\.sourceRefs'\}/);
  assert.match(code, /JSON\.stringify\(item\[1\]\)\+'\\n'/);
});

'''
if 'compiled static projection avoids duplicating graph truth' not in test:
    assert anchor in test; test=test.replace(anchor,newtest+anchor)
testp.write_text(test)

code=code.replace("    nodes: stableSort_(graph.nodes, 'id'),","    nodes: stableSort_(graph.nodes.map(compactAtlasNode_), 'id'),")
code=code.replace("    edges: stableSortEdges_(integrity.validEdges),","    edges: stableSortEdges_(integrity.validEdges.filter(e=>e.type!=='CONTAINS').map(compactAtlasEdge_)),")
code=code.replace("    activity: science.activity.concat(operations.activity).slice(-1000),","    activity: science.activity.concat(operations.activity).slice(-300).map(compactActivity_),")
code=code.replace("    olympus: olympusProjection.summary,","    olympus: {sourceId:olympusProjection.summary.sourceId,eventCount:olympusProjection.summary.eventCount,evidenceCount:olympusProjection.summary.evidenceCount,clientCount:olympusProjection.summary.clientCount},")
code=code.replace("{content:JSON.stringify(item[1],null,2)+'\\n',encoding:'utf-8'}","{content:JSON.stringify(item[1])+'\\n',encoding:'utf-8'}")

code, n = re.subn(r"function buildLineage_\(atlas\) \{.*?\n\}\n\nfunction buildPresentation_\(atlas\) \{.*?\n\}",r'''function buildLineage_(atlas) {
  const parent={},children={};
  atlas.nodes.forEach(n=>{if(n.parentId){parent[n.id]=n.parentId;(children[n.parentId]||(children[n.parentId]=[])).push(n.id)}});
  return {parent,children,relations:{source:'atlas.data.edges'},provenance:{source:'atlas.data.nodes[*].sourceRefs'},integrity:atlas.integrity||{}};
}

function buildPresentation_(atlas) {
  const stories={};
  atlas.nodes.filter(n=>n.type==='CAMPAIGN').forEach(c=>{stories[c.id]={topic:c.label,question:c.scientificQuestion||c.summary||'',currentState:c.currentVerdict||c.status,nextActions:[c.nextValidAction].filter(Boolean)}});
  return {stories};
}''',code,flags=re.S)
assert n==1,n

helpers=r'''function compactAtlasNode_(n){
  const out={id:n.id,type:n.type,label:clip_(n.label,140),status:clip_(n.status,100)};
  if(n.parentId)out.parentId=n.parentId;if(n.domain)out.domain=clip_(n.domain,80);if(n.summary)out.summary=clip_(n.summary,240);if(n.activityAt)out.activityAt=clip_(n.activityAt,60);if(n.authority)out.authority=clip_(n.authority,60);
  const refs=(n.sourceRefs||[]).slice(0,3).map(compactRef_).filter(Boolean);if(refs.length)out.sourceRefs=refs;
  ['scientificQuestion','currentVerdict','nextValidAction','nextAction','claimImpact'].forEach(k=>{if(n[k])out[k]=clip_(n[k],280)});
  if(n.actionIds&&n.actionIds.length)out.actionIds=n.actionIds.slice(0,8).map(v=>clip_(v,160));
  if(n.integrity)out.integrity=n.integrity;
  return out;
}
function compactRef_(r){if(!r)return null;const out={source:clip_(r.source||'SOURCE',40)};if(r.sourceId)out.sourceId=clip_(r.sourceId,120);if(r.sourceRef&&String(r.sourceRef).length<=160)out.sourceRef=clip_(r.sourceRef,160);return out}
function compactAtlasEdge_(e){const out={source:e.source,target:e.target,type:e.type};if(e.authority)out.authority=clip_(e.authority,60);if(e.provenance)out.provenance=clip_(e.provenance,120);return out}
function compactActivity_(a){return{entityId:clip_(a.entityId||'',160),at:clip_(a.at||'',60),summary:clip_(a.summary||'',200),source:clip_(a.source||'',80)}}
'''
if 'function compactAtlasNode_' not in code:
    code=code.replace('function compactNode_(n){',helpers+'function compactNode_(n){')
if 'function clip_(value,max)' not in code:
    code=code.replace('function token_(value){',"function clip_(value,max){const s=String(value==null?'':value);return s.length>(max||320)?s.slice(0,(max||320)-1)+'…':s}\nfunction token_(value){")
# compact record values too
code=code.replace("function compactRecord_(surface,row){return{surface,id:pick_(row,['strategy_id','policy_id','memory_id','lesson_id','skill_id','relation_id','action_id','run_id','event_id','id','ID'])||'',status:pick_(row,['status','state','claim_state'])||'',updatedAt:pick_(row,['updated_at','last_seen','last_checked','observed_at'])||'',title:pick_(row,['title','name','summary','statement','event_type'])||''}}",
"function compactRecord_(surface,row){return{surface,id:clip_(pick_(row,['strategy_id','policy_id','memory_id','lesson_id','skill_id','relation_id','action_id','run_id','event_id','id','ID'])||'',160),status:clip_(pick_(row,['status','state','claim_state'])||'',120),updatedAt:clip_(pick_(row,['updated_at','last_seen','last_checked','observed_at'])||'',80),title:clip_(pick_(row,['title','name','summary','statement','event_type'])||'',220)}}")
codep.write_text(code)
