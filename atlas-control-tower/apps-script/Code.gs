const ATLAS = Object.freeze({
  schema: 'nexo-atlas-snapshot/v1',
  repo: 'byDenoso/Pantheon',
  branch: 'main',
  root: 'atlas-control-tower/data',
  tower: '1Y9YYAn2x0NDIBTbl1bvkwBbSEGz6kHLxzAl90SQ0-GA',
  learning: '1to_VBC5edy3kHbkn4CDjG2r33tr0jdtky2Ie80afbEI',
  ops: '1twRpSoZCOXv77YyCh_5V9nAS2PM2nqzex2A37eI2Zas',
  olympus: '1qj7VyA7wN3zr6ySZZ9kxHi4Szt99IV5Hf3jRWJAykLM',
  stateIndex: '1iBa4iFe2nNPtSLAhoMjy5a5WPNwm0hgJeoNmyexl0Qs',
  maxRows: 12000,
  maxCols: 64
});

function syncAtlas() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return {state: 'LOCKED'};
  try {
    const compiled = compileAtlasProjection();
    const current = readGitHubSnapshot_('atlas.json');
    if (current && current.fingerprint === compiled.fingerprint) {
      rememberSync_(compiled.fingerprint, current.commitSha || '', 'NO_OP');
      return {state: 'NO_OP', fingerprint: compiled.fingerprint, generatedAt: compiled.generatedAt};
    }
    const out = syncAtlasToGitHub(compiled);
    rememberSync_(compiled.fingerprint, out.commitSha, 'UPDATED');
    return {state: 'UPDATED', fingerprint: compiled.fingerprint, commitSha: out.commitSha, generatedAt: compiled.generatedAt};
  } finally {
    lock.releaseLock();
  }
}

function compileAtlasProjection() {
  const tower = SpreadsheetApp.openById(ATLAS.tower);
  const learning = SpreadsheetApp.openById(ATLAS.learning);
  const ops = SpreadsheetApp.openById(ATLAS.ops);
  const olympus = SpreadsheetApp.openById(ATLAS.olympus);
  const graph = createGraph_();

  addSystemNodes_(graph);
  const science = projectScience_(tower, graph);
  const learned = projectLearning_(learning, graph);
  const operations = projectOperations_(ops, graph);
  const olympusProjection = projectOlympus_(olympus, graph);

  const atlasData = {
    nodes: stableSort_(graph.nodes, 'id'),
    edges: stableSortEdges_(dedupeEdges_(graph.edges)),
    activity: science.activity.concat(operations.activity).slice(-1000),
    learning: learned.records,
    operations: operations.records,
    olympus: olympusProjection.summary,
    systemState: {sourceId: ATLAS.stateIndex, mode: 'truth-owner-pointer', authority: 'GOOGLE_DRIVE'}
  };
  const lineageData = buildLineage_(atlasData);
  const presentationData = buildPresentation_(atlasData);
  validateProjection_(atlasData, lineageData, presentationData);

  const fingerprint = sha256Hex_(canonicalJson_({atlas: atlasData, lineage: lineageData, presentation: presentationData}));
  const generatedAt = new Date().toISOString();
  return {
    fingerprint,
    generatedAt,
    atlas: envelope_(generatedAt, fingerprint, atlasData),
    lineage: envelope_(generatedAt, fingerprint, lineageData),
    presentation: envelope_(generatedAt, fingerprint, presentationData)
  };
}

function createGraph_() {
  const nodes = [], edges = [], ids = {};
  return {
    nodes,
    edges,
    addNode(node) {
      if (!node || !node.id || ids[node.id]) return node && node.id;
      ids[node.id] = true;
      nodes.push(node);
      return node.id;
    },
    addEdge(source, target, type, authority, provenance) {
      if (!source || !target || source === target) return;
      edges.push({source: String(source), target: String(target), type: String(type || 'RELATED_TO'), authority: authority || 'DRIVE', provenance: provenance || null});
    }
  };
}

function addSystemNodes_(g) {
  g.addNode(node_('system:NEXO', 'SYSTEM', 'NEXO', null, null, 'ACTIVE', 'Google Drive is the truth owner.'));
  g.addNode(node_('system:SCIENCE', 'SYSTEM', 'Science', 'system:NEXO', 'SCIENCE', 'ACTIVE', 'Scientific state from PEER_CONTROL_TOWER_CANONICAL.'));
  g.addNode(node_('system:LEARNING', 'SYSTEM', 'Learning', 'system:NEXO', 'LEARNING', 'ACTIVE', 'Associative and procedural learning from Drive.'));
  g.addNode(node_('system:OPERATIONS', 'SYSTEM', 'Operations', 'system:NEXO', 'OPERATIONS', 'ACTIVE', 'Operational state from NEXO ACTION_REGISTER.'));
  g.addNode(node_('system:OLYMPUS', 'PROJECT', 'Olympus', 'system:NEXO', 'OLYMPUS', 'ACTIVE', 'Olympus ledger projection.'));
  ['system:SCIENCE','system:LEARNING','system:OPERATIONS','system:OLYMPUS'].forEach(id => g.addEdge('system:NEXO', id, 'CONTAINS', 'CANONICAL_BOUNDARY'));
}

function projectScience_(book, g) {
  const campaignForTest = {}, hypothesisForTest = {}, activity = [];
  const domains = readTable_(book, 'Domain Registry');
  domains.forEach(row => {
    const raw = pick_(row, ['domain_id','Domain ID','id','ID','Domain']);
    if (!raw) return;
    const id = 'domain:' + token_(raw);
    const n = node_(id, 'DOMAIN', pick_(row,['name','Name','domain_name','Domain Name']) || raw, 'system:SCIENCE', raw, pick_(row,['status','Status']) || 'ACTIVE', pick_(row,['description','Description']) || '');
    n.authority = 'SCIENCE_CANONICAL';
    n.sourceRefs = [ref_('GOOGLE_DRIVE','Domain Registry',raw)];
    g.addNode(n); g.addEdge('system:SCIENCE', id, 'CONTAINS', 'SCIENCE_CANONICAL');
  });

  function ensureDomain(raw) {
    const value = String(raw || 'UNSCOPED').trim();
    const id = 'domain:' + token_(value);
    const n = node_(id, 'DOMAIN', value, 'system:SCIENCE', value, 'ACTIVE', 'Domain projected from an explicit Drive field.');
    n.authority = 'DERIVED_NAVIGATION'; n.sourceRefs = [ref_('GOOGLE_DRIVE','explicit domain field',value)];
    g.addNode(n); g.addEdge('system:SCIENCE', id, 'CONTAINS', 'DERIVED_FROM_EXPLICIT_FIELD');
    return id;
  }

  readTable_(book, 'SCIENTIFIC_CAMPAIGNS').forEach(row => {
    const raw = pick_(row,['campaign_id','Campaign ID']); if (!raw) return;
    const domain = pick_(row,['domain','Domain']) || 'UNSCOPED', parent = ensureDomain(domain), id = 'campaign:' + raw;
    const n = node_(id,'CAMPAIGN',pick_(row,['campaign_name','Campaign Name']) || raw,parent,domain,pick_(row,['status','Status','State']) || 'UNKNOWN',pick_(row,['scientific_question','Scientific Question']) || '');
    n.scientificQuestion = n.summary; n.currentVerdict = pick_(row,['current_verdict']) || ''; n.nextValidAction = pick_(row,['next_valid_action']) || ''; n.activityAt = pick_(row,['updated_at']) || ''; n.authority = 'DERIVED_NAVIGATION'; n.sourceRefs = [ref_('GOOGLE_DRIVE','SCIENTIFIC_CAMPAIGNS',raw)];
    g.addNode(n); g.addEdge(parent,id,'CONTAINS','DERIVED_NAVIGATION');
    splitIds_(pick_(row,['test_ids[]','test_ids','Test IDs'])).forEach(test => { if (!campaignForTest[test]) campaignForTest[test] = id; });
  });

  readTable_(book, 'CLAIMS').forEach(row => {
    const raw = pick_(row,['claim_id','Claim ID']); if (!raw) return;
    const domain = pick_(row,['scope','Scope']) || 'UNSCOPED', parent = ensureDomain(domain), id = 'claim:' + raw;
    const n = node_(id,'CLAIM',pick_(row,['statement','Statement']) || raw,parent,domain,pick_(row,['status','Status']) || 'UNKNOWN',pick_(row,['statement','Statement']) || '');
    n.nextAction = pick_(row,['next_falsifier']) || ''; n.authority = 'SCIENCE_CANONICAL'; n.sourceRefs = [ref_('GOOGLE_DRIVE','CLAIMS',raw)];
    g.addNode(n); g.addEdge(parent,id,'CONTAINS','SCIENCE_CANONICAL');
  });

  readTable_(book, 'Hypothesis Registry').forEach(row => {
    const raw = pick_(row,['Hypothesis ID','hypothesis_id']); if (!raw) return;
    const test = pick_(row,['Primary Test ID','primary_test_id']) || '', domain = pick_(row,['Domain','domain']) || 'UNSCOPED';
    const parent = campaignForTest[test] || ensureDomain(domain), id = 'hypothesis:' + raw;
    const n = node_(id,'HYPOTHESIS',pick_(row,['Hypothesis','statement']) || raw,parent,domain,pick_(row,['State','status']) || 'UNKNOWN',pick_(row,['Hypothesis','statement']) || '');
    n.killCriterion = pick_(row,['Kill Criterion']) || ''; n.survivalCriterion = pick_(row,['Survival Criterion']) || ''; n.nextAction = pick_(row,['Expected Decision Change']) || ''; n.activityAt = pick_(row,['Last Updated']) || ''; n.authority = 'SCIENCE_CANONICAL'; n.sourceRefs = [ref_('GOOGLE_DRIVE','Hypothesis Registry',raw)];
    g.addNode(n); g.addEdge(parent,id,'CONTAINS','SCIENCE_CANONICAL');
    if (test) { hypothesisForTest[test] = id; g.addEdge(id,'test:'+test,'PRIMARY_TEST','EXPLICIT_DRIVE_FIELD'); }
  });

  readTable_(book, 'Decision Hypotheses').forEach(row => {
    const raw = pick_(row,['Hypothesis ID','Decision Hypothesis ID','ID']); if (!raw) return;
    const domain = pick_(row,['Domain','domain']) || 'UNSCOPED', parent = ensureDomain(domain), id = 'decision-hypothesis:' + raw;
    const n = node_(id,'DECISION_HYPOTHESIS',pick_(row,['Hypothesis','Statement','Title']) || raw,parent,domain,pick_(row,['State','Status']) || 'UNKNOWN',pick_(row,['Hypothesis','Statement','Summary']) || '');
    n.authority = 'SCIENCE_CANONICAL'; n.sourceRefs = [ref_('GOOGLE_DRIVE','Decision Hypotheses',raw)];
    g.addNode(n); g.addEdge(parent,id,'CONTAINS','SCIENCE_CANONICAL');
  });

  readTable_(book, 'Test Registry').forEach(row => {
    const raw = pick_(row,['Test ID','test_id']); if (!raw) return;
    const domain = pick_(row,['Lane','Domain','domain']) || 'UNSCOPED', parent = hypothesisForTest[raw] || campaignForTest[raw] || ensureDomain(domain), id = 'test:' + raw;
    const n = node_(id,'TEST',pick_(row,['Test / Question','Test','Question']) || raw,parent,domain,pick_(row,['Status']) || 'UNKNOWN',pick_(row,['Result Summary']) || '');
    n.evidenceClass = pick_(row,['Evidence Class']) || ''; n.keyMetrics = pick_(row,['Key Metrics']) || ''; n.claimImpact = pick_(row,['Claim Impact']) || ''; n.nextAction = pick_(row,['Next Gate']) || ''; n.activityAt = pick_(row,['Last Verified']) || ''; n.authority = 'SCIENCE_CANONICAL'; n.sourceRefs = dedupeRefs_([ref_('GOOGLE_DRIVE','Test Registry',raw), driveRef_(pick_(row,['Drive Source'])), provenanceRef_(pick_(row,['Provenance']))].filter(Boolean));
    g.addNode(n); g.addEdge(parent,id,'CONTAINS','SCIENCE_CANONICAL');
  });

  const envelopes = {};
  readTable_(book, 'Result Envelopes').forEach(row => {
    const eid = pick_(row,['Envelope ID']), tid = pick_(row,['Test ID']), field = pick_(row,['Field']);
    if (!eid || !tid || !field) return;
    if (!envelopes[eid]) envelopes[eid] = {testId: tid, fields: {}};
    envelopes[eid].fields[field] = pick_(row,['Value']);
  });
  Object.keys(envelopes).forEach(eid => {
    const e = envelopes[eid], status = firstField_(e.fields,['STATUS','status','VERDICT','verdict']) || 'RECORDED', summary = firstField_(e.fields,['RESULT_SUMMARY','result_summary','summary','VERDICT','TEST_INTENT']) || '';
    const id = 'result:' + eid, n = node_(id,'RESULT',eid,'test:'+e.testId,null,status,summary);
    n.authority = 'SCIENCE_CANONICAL'; n.sourceRefs = [ref_('GOOGLE_DRIVE','Result Envelopes',eid)];
    g.addNode(n); g.addEdge('test:'+e.testId,id,'PRODUCES_RESULT','SCIENCE_CANONICAL');
  });

  readTable_(book, 'Sources').forEach((row, index) => {
    const name = pick_(row,['Name','name']), url = pick_(row,['URL','url']); if (!name && !url) return;
    const id = 'source:' + token_(url || name), n = node_(id,'SOURCE',name || url,'system:SCIENCE',null,pick_(row,['Trust / State']) || 'KNOWN',pick_(row,['Role']) || '');
    n.url = url || ''; n.authority = 'SOURCE_REGISTRY'; n.sourceRefs = [ref_('GOOGLE_DRIVE','Sources',String(index+2))]; g.addNode(n);
  });

  readTable_(book, 'PUBLICATIONS').forEach((row,index) => {
    const raw = pick_(row,['publication_id','Publication ID','ID','Title','title']); if (!raw) return;
    const id = 'publication:' + token_(raw), n = node_(id,'PUBLICATION',pick_(row,['Title','title','Name','name']) || raw,'system:SCIENCE',pick_(row,['Domain','domain']) || null,pick_(row,['Status','status']) || 'UNKNOWN',pick_(row,['Summary','summary','Notes']) || '');
    n.authority='SCIENCE_CANONICAL'; n.sourceRefs=[ref_('GOOGLE_DRIVE','PUBLICATIONS',String(index+2))]; g.addNode(n); g.addEdge('system:SCIENCE',id,'CONTAINS','SCIENCE_CANONICAL');
  });

  readTable_(book, 'Change Log').slice(-500).forEach(row => activity.push({entityId: pick_(row,['Entity ID','Test ID','ID']) || '', at: pick_(row,['Timestamp','Updated','Date']) || '', summary: pick_(row,['Change','Summary','Action']) || '', source: 'PEER_CONTROL_TOWER_CANONICAL/Change Log'}));
  return {activity};
}

function projectLearning_(book, g) {
  const index = readTable_(book, 'LEARNING_INDEX');
  const procedural = readTable_(book, 'PROCEDURAL_MEMORY');
  const policies = readTable_(book, 'ADAPTIVE_POLICY');
  const strategies = readTable_(book, 'STRATEGY_REGISTRY');
  const relations = readTable_(book, 'RELATION_LEDGER');
  const historical = readTable_(book, 'HISTORICAL_LEARNING_LEDGER');
  const skills = readTable_(book, 'SKILL_EVOLUTION');
  const metrics = readTable_(book, 'VALUE_METRICS');
  const records = [];

  [['PROCEDURAL_MEMORY',procedural,'MEMORY'],['ADAPTIVE_POLICY',policies,'POLICY'],['STRATEGY_REGISTRY',strategies,'STRATEGY'],['SKILL_EVOLUTION',skills,'SKILL']].forEach(spec => {
    const surface=spec[0], rows=spec[1], type=spec[2];
    rows.forEach((row,i) => {
      const raw = pick_(row,['strategy_id','policy_id','memory_id','lesson_id','skill_id','id','ID']) || surface+':' +(i+2);
      const id = 'learning:' + token_(surface) + ':' + token_(raw), n = node_(id,type,pick_(row,['title','name','summary','statement']) || raw,'system:LEARNING',pick_(row,['domain','scope']) || 'LEARNING',pick_(row,['status','state']) || 'RECORDED',pick_(row,['description','statement','lesson','notes']) || '');
      n.authority='DERIVED_KNOWLEDGE_NOT_EVIDENCE'; n.activityAt=pick_(row,['updated_at','last_validated_at','last_seen']) || ''; n.sourceRefs=[ref_('GOOGLE_DRIVE',surface,raw)];
      g.addNode(n); g.addEdge('system:LEARNING',id,'CONTAINS','DERIVED_KNOWLEDGE_NOT_EVIDENCE'); records.push(compactRecord_(surface,row));
    });
  });

  const concepts = {};
  function concept(label,domain) {
    const key=String(label||'').trim(); if(!key) return null;
    if(concepts[key]) return concepts[key];
    const id='learning-concept:'+token_(key), n=node_(id,'LEARNING',key,'system:LEARNING',domain||'LEARNING','RECORDED','Associative concept from RELATION_LEDGER.');
    n.authority='DERIVED_KNOWLEDGE_NOT_EVIDENCE'; n.sourceRefs=[ref_('GOOGLE_DRIVE','RELATION_LEDGER',key)]; g.addNode(n); g.addEdge('system:LEARNING',id,'CONTAINS','DERIVED_KNOWLEDGE_NOT_EVIDENCE'); concepts[key]=id; return id;
  }
  relations.forEach(row => {
    const a=concept(pick_(row,['node_a']),pick_(row,['domain_a'])), b=concept(pick_(row,['node_b']),pick_(row,['domain_b']));
    if(a&&b) g.addEdge(a,b,pick_(row,['relation_type'])||'ASSOCIATED_WITH','DERIVED_KNOWLEDGE_NOT_EVIDENCE',pick_(row,['relation_id']));
  });

  records.push(...index.map(r=>compactRecord_('LEARNING_INDEX',r)), ...historical.map(r=>compactRecord_('HISTORICAL_LEARNING_LEDGER',r)), ...relations.map(r=>compactRecord_('RELATION_LEDGER',r)), ...metrics.map(r=>compactRecord_('VALUE_METRICS',r)));
  return {records};
}

function projectOperations_(book, g) {
  const actions=readTable_(book,'ACTION_INDEX'), runs=readTable_(book,'EXECUTION_RUNS'), signals=readTable_(book,'SIGNAL_LEDGER'), effects=readTable_(book,'EFFECT_LEDGER'), relations=readTable_(book,'RELATION_LEDGER'), activity=[], records=[];
  actions.forEach((row,i)=>{
    const raw=pick_(row,['action_id','Action ID']) || 'row-'+(i+2), id='action:'+token_(raw), n=node_(id,'OPERATION',pick_(row,['action','Ação','summary'])||raw,'system:OPERATIONS',pick_(row,['domain'])||'OPERATIONS',pick_(row,['status'])||'UNKNOWN',pick_(row,['inference_basis','next_action','summary'])||'');
    n.activityAt=pick_(row,['last_checked'])||''; n.authority='OPERATIONS_CANONICAL'; n.sourceRefs=[ref_('GOOGLE_DRIVE','ACTION_INDEX',raw)]; g.addNode(n); g.addEdge('system:OPERATIONS',id,'CONTAINS','OPERATIONS_CANONICAL'); records.push(compactRecord_('ACTION_INDEX',row));
  });
  runs.forEach((row,i)=>{
    const raw=pick_(row,['run_id','Run ID']) || 'row-'+(i+2), id='run:'+token_(raw), parentRaw=pick_(row,['action_id','Action ID']), parent=parentRaw?'action:'+token_(parentRaw):'system:OPERATIONS', n=node_(id,'RUN',pick_(row,['title','run_type','operation'])||raw,parent,pick_(row,['domain'])||'OPERATIONS',pick_(row,['status','outcome'])||'UNKNOWN',pick_(row,['summary','result_summary','message'])||'');
    n.activityAt=pick_(row,['finished_at','observed_at','started_at','timestamp'])||''; n.authority='OPERATIONS_CANONICAL'; n.sourceRefs=[ref_('GOOGLE_DRIVE','EXECUTION_RUNS',raw)]; g.addNode(n); g.addEdge(parent,id,'EXECUTED_AS','OPERATIONS_CANONICAL'); records.push(compactRecord_('EXECUTION_RUNS',row)); activity.push({entityId:id,at:n.activityAt,summary:n.summary,source:'NEXO ACTION_REGISTER/EXECUTION_RUNS'});
  });
  records.push(...signals.map(r=>compactRecord_('SIGNAL_LEDGER',r)),...effects.map(r=>compactRecord_('EFFECT_LEDGER',r)),...relations.map(r=>compactRecord_('RELATION_LEDGER',r)));
  return {records,activity};
}

function projectOlympus_(book, g) {
  const ledger=readTable_(book,'Ledger'), evidence=readTable_(book,'Evidence_Registry'), clients={}, events=[];
  ledger.forEach(row=>{
    const eventId=pick_(row,['event_id']), clientId=pick_(row,['client_id']), eventType=pick_(row,['event_type']); if(!eventId) return;
    let payload={}; try{payload=JSON.parse(pick_(row,['payload_json'])||'{}')}catch(e){}
    if(clientId && !clients[clientId]) {
      const label=payload.display_name || clientId, id='olympus-client:'+token_(clientId), n=node_(id,'PROJECT',label,'system:OLYMPUS','OLYMPUS','ACTIVE','Olympus client state from the canonical ledger.');
      n.authority='OLYMPUS_CANONICAL'; n.sourceRefs=[ref_('GOOGLE_DRIVE','Ledger',clientId)]; g.addNode(n); g.addEdge('system:OLYMPUS',id,'CONTAINS','OLYMPUS_CANONICAL'); clients[clientId]=id;
    }
    const parent=clientId && clients[clientId] ? clients[clientId] : 'system:OLYMPUS', id='olympus-event:'+token_(eventId), n=node_(id,'RESULT',eventType||eventId,parent,'OLYMPUS',pick_(row,['claim_state','integrity_status'])||'RECORDED',pick_(row,['reason'])||'');
    n.activityAt=pick_(row,['observed_at','recorded_at'])||''; n.authority='OLYMPUS_CANONICAL'; n.sourceRefs=[ref_('GOOGLE_DRIVE','Ledger',pick_(row,['source_ref'])||eventId)]; g.addNode(n); g.addEdge(parent,id,'PRODUCES_RESULT','OLYMPUS_CANONICAL'); events.push(compactRecord_('Ledger',row));
  });
  return {summary:{sourceId:ATLAS.olympus,eventCount:ledger.length,evidenceCount:evidence.length,clientCount:Object.keys(clients).length,events:events.slice(-200),evidence:evidence.slice(-200).map(r=>compactRecord_('Evidence_Registry',r))}};
}

function syncAtlasToGitHub(compiled) {
  const props=PropertiesService.getScriptProperties(), token=props.getProperty('NEXO_GITHUB_TOKEN');
  if(!token) throw new Error('Missing Script Property NEXO_GITHUB_TOKEN');
  const branch=props.getProperty('ATLAS_GITHUB_BRANCH')||ATLAS.branch;
  const ref=gh_('GET','/git/ref/heads/'+encodeURIComponent(branch),null,token), head=ref.object.sha, headCommit=gh_('GET','/git/commits/'+head,null,token), treeEntries=[];
  [['atlas.json',compiled.atlas],['lineage.json',compiled.lineage],['presentation.json',compiled.presentation]].forEach(item=>{
    const blob=gh_('POST','/git/blobs',{content:JSON.stringify(item[1],null,2)+'\n',encoding:'utf-8'},token);
    treeEntries.push({path:ATLAS.root+'/'+item[0],mode:'100644',type:'blob',sha:blob.sha});
  });
  const tree=gh_('POST','/git/trees',{base_tree:headCommit.tree.sha,tree:treeEntries},token);
  const next=gh_('POST','/git/commits',{message:'data(atlas): compile Drive snapshot '+compiled.fingerprint.slice(0,12),tree:tree.sha,parents:[head]},token);
  gh_('PATCH','/git/refs/heads/'+encodeURIComponent(branch),{sha:next.sha,force:false},token);
  ['atlas.json','lineage.json','presentation.json'].forEach(name=>{const rb=readGitHubSnapshot_(name,next.sha);if(!rb||rb.fingerprint!==compiled.fingerprint)throw new Error('GitHub readback fingerprint mismatch: '+name)});
  return {commitSha:next.sha,branch,fingerprint:compiled.fingerprint};
}

function installAtlasTrigger() {
  ScriptApp.getProjectTriggers().forEach(t=>{if(t.getHandlerFunction()==='syncAtlas')ScriptApp.deleteTrigger(t)});
  ScriptApp.newTrigger('syncAtlas').timeBased().everyMinutes(15).create();
  return {state:'INSTALLED',handler:'syncAtlas',everyMinutes:15};
}

function readGitHubSnapshot_(name, refOverride) {
  const props=PropertiesService.getScriptProperties(), token=props.getProperty('NEXO_GITHUB_TOKEN'); if(!token)return null;
  const ref=refOverride||props.getProperty('ATLAS_GITHUB_BRANCH')||ATLAS.branch;
  try{const out=gh_('GET','/contents/'+ATLAS.root+'/'+name+'?ref='+encodeURIComponent(ref),null,token),raw=Utilities.newBlob(Utilities.base64Decode(String(out.content||'').replace(/\s/g,''))).getDataAsString('UTF-8'),parsed=JSON.parse(raw);return{fingerprint:parsed.fingerprint,commitSha:out.sha,envelope:parsed}}catch(e){return null}
}

function gh_(method,path,payload,token) {
  const response=UrlFetchApp.fetch('https://api.github.com/repos/'+ATLAS.repo+path,{method:method.toLowerCase(),muteHttpExceptions:true,contentType:'application/json',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'NEXO-Atlas-Drive-Compiler'},payload:payload==null?undefined:JSON.stringify(payload)});
  const code=response.getResponseCode(), text=response.getContentText(); if(code<200||code>=300)throw new Error('GitHub '+code+' '+path+' '+text.slice(0,500)); return text?JSON.parse(text):{};
}

function readTable_(book,name) {
  const sheet=book.getSheetByName(name); if(!sheet)return[];
  const rows=Math.min(sheet.getLastRow(),ATLAS.maxRows), cols=Math.min(sheet.getLastColumn(),ATLAS.maxCols); if(rows<1||cols<1)return[];
  const values=sheet.getRange(1,1,rows,cols).getDisplayValues(); let headerIndex=0;
  while(headerIndex<values.length && values[headerIndex].filter(Boolean).length<2)headerIndex++;
  if(headerIndex>=values.length)return[];
  const headers=values[headerIndex].map((v,i)=>String(v||('COL_'+(i+1))).trim());
  return values.slice(headerIndex+1).filter(row=>row.some(v=>String(v).trim()!=='')).map(row=>{const out={};headers.forEach((h,i)=>out[h]=row[i]==null?'':row[i]);return out});
}

function buildLineage_(atlas) {
  const parent={},children={},provenance={};
  atlas.nodes.forEach(n=>{if(n.parentId){parent[n.id]=n.parentId;(children[n.parentId]||(children[n.parentId]=[])).push(n.id)}if(n.sourceRefs&&n.sourceRefs.length)provenance[n.id]=n.sourceRefs});
  return {parent,children,relations:atlas.edges,provenance};
}

function buildPresentation_(atlas) {
  const byParent={}; atlas.nodes.forEach(n=>{if(n.parentId)(byParent[n.parentId]||(byParent[n.parentId]=[])).push(n)}); const stories={};
  atlas.nodes.filter(n=>n.type==='CAMPAIGN').forEach(c=>{const desc=descendants_(c.id,byParent);stories[c.id]={topic:c.label,question:c.scientificQuestion||c.summary||'',currentState:c.currentVerdict||c.status,hypotheses:desc.filter(n=>['HYPOTHESIS','DECISION_HYPOTHESIS','CLAIM'].includes(n.type)).map(compactNode_),tests:desc.filter(n=>n.type==='TEST').map(compactNode_),results:desc.filter(n=>n.type==='RESULT').map(compactNode_),changes:atlas.activity.filter(a=>a.entityId===c.id||desc.some(n=>n.id===a.entityId)),evidence:desc.filter(n=>n.sourceRefs&&n.sourceRefs.length).map(n=>({id:n.id,sourceRefs:n.sourceRefs})),uncertainties:[],nextActions:[c.nextValidAction].filter(Boolean)}});
  return {stories};
}

function validateProjection_(atlas,lineage,presentation) {
  if(!atlas.nodes.length)throw new Error('Projection has no nodes'); const ids={};
  atlas.nodes.forEach(n=>{if(!n.id)throw new Error('Node without id');if(ids[n.id])throw new Error('Duplicate node id '+n.id);ids[n.id]=true});
  atlas.edges.forEach(e=>{if(!ids[e.source]||!ids[e.target])throw new Error('Orphan edge '+e.source+' -> '+e.target)});
  if(!lineage.parent||!lineage.children)throw new Error('Invalid lineage projection'); if(!presentation.stories)throw new Error('Invalid presentation projection');
}

function node_(id,type,label,parentId,domain,status,summary) { return {id,type,visualType:type,label:String(label||id),parentId:parentId||null,domain:domain||null,status:status||'UNKNOWN',summary:summary||'',sourceRefs:[]}; }
function ref_(source,sourceRef,sourceId){return{source,sourceRef,sourceId:String(sourceId||'')}}
function driveRef_(value){const s=String(value||'').trim();return s?{source:'GOOGLE_DRIVE',sourceRef:s,sourceId:(s.match(/[-\w]{20,}/)||[s])[0]}:null}
function provenanceRef_(value){const s=String(value||'').trim();return s?{source:'PROVENANCE',sourceRef:s,sourceId:token_(s)}:null}
function dedupeRefs_(refs){const seen={};return refs.filter(r=>{const k=canonicalJson_(r);if(seen[k])return false;seen[k]=1;return true})}
function dedupeEdges_(edges){const seen={};return edges.filter(e=>{const k=e.source+'|'+e.target+'|'+e.type;if(seen[k])return false;seen[k]=1;return true})}
function stableSort_(items,key){return items.slice().sort((a,b)=>String(a[key]||'').localeCompare(String(b[key]||'')))}
function stableSortEdges_(items){return items.slice().sort((a,b)=>(a.source+'|'+a.target+'|'+a.type).localeCompare(b.source+'|'+b.target+'|'+b.type))}
function descendants_(root,byParent){const out=[],q=[...(byParent[root]||[])],seen={};while(q.length){const n=q.shift();if(seen[n.id])continue;seen[n.id]=1;out.push(n);q.push(...(byParent[n.id]||[]))}return out}
function compactNode_(n){return{id:n.id,label:n.label,status:n.status,summary:n.summary,activityAt:n.activityAt||'',sourceRefs:n.sourceRefs||[]}}
function compactRecord_(surface,row){return{surface,id:pick_(row,['strategy_id','policy_id','memory_id','lesson_id','skill_id','relation_id','action_id','run_id','event_id','id','ID'])||'',status:pick_(row,['status','state','claim_state'])||'',updatedAt:pick_(row,['updated_at','last_seen','last_checked','observed_at'])||'',title:pick_(row,['title','name','summary','statement','event_type'])||''}}
function firstField_(fields,names){for(const n of names)if(fields[n]!=null&&String(fields[n]).trim()!=='')return fields[n];return''}
function pick_(row,names){if(!row)return'';for(const n of names)if(Object.prototype.hasOwnProperty.call(row,n)&&String(row[n]).trim()!=='')return row[n];const normalized={};Object.keys(row).forEach(k=>normalized[norm_(k)]=row[k]);for(const n of names){const v=normalized[norm_(n)];if(v!=null&&String(v).trim()!=='')return v}return''}
function splitIds_(value){return String(value||'').split(/\s*\|\s*|\s*,\s*|\n+/).map(v=>v.trim()).filter(Boolean)}
function token_(value){return String(value||'').trim().replace(/^https?:\/\//i,'').replace(/[^A-Za-z0-9._:-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,120)||'UNKNOWN'}
function norm_(value){return String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'')}
function envelope_(generatedAt,fingerprint,data){return{schemaVersion:ATLAS.schema,generatedAt,source:'GOOGLE_DRIVE',fingerprint,data}}
function canonicalJson_(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return'['+value.map(canonicalJson_).join(',')+']';return'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJson_(value[k])).join(',')+'}'}
function sha256Hex_(text){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('')}
function rememberSync_(fingerprint,commitSha,state){PropertiesService.getScriptProperties().setProperties({LAST_ATLAS_FINGERPRINT:fingerprint||'',LAST_ATLAS_COMMIT:commitSha||'',LAST_ATLAS_SYNC_STATE:state||'',LAST_ATLAS_SYNC_AT:new Date().toISOString()},false)}
