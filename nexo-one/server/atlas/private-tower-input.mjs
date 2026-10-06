import {TOWER_ID} from '../mcp/operational-state.mjs';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=()=>{throw new Error('PRIVATE_TOWER_INVALID');};
// Normalize only canonical entity/manifest/snapshot surfaces. Runtime text is
// retained server-side for bounded tool-declaration extraction, never serialized.
export function normalizePrivateTower(tower){
  if(!object(tower)||tower.contract!=='NEXO_TOWER_LIVE_V1'||tower.authority!=='TOWER_V06'||tower.storage!=='GOOGLE_DRIVE_PRIVATE'||tower.truth_owner!=='TOWER_V06@GOOGLE_DRIVE_PRIVATE'||tower.write_model!=='IN_PLACE_FILE_REVISION_CAS_READBACK'||tower.stable_file_id!==TOWER_ID||tower.revision!==tower.state_fingerprint||!/^sha256:[a-f0-9]{64}$/.test(tower.revision)||!object(tower.files)||tower.file_count!==Object.keys(tower.files).length||!Number.isFinite(Date.parse(tower.updated_at)))fail();
  const files=tower.files;
  const value=key=>files[key]?.encoding==='json'?structuredClone(files[key].value):undefined;
  const control=value('CONTROL.json');if(!object(control)||control.truth_owner!==tower.truth_owner)fail();
  const coverage={};
  const idFields={work:'work_id',tests:'test_id',hypotheses:'hypothesis_id',campaigns:'campaign_id',roadmaps:'roadmap_id',lessons:'lesson_id',artifacts:'artifact_id',events:'event_id'};
  const collect=(name,prefix)=>{
    const paths=Object.keys(files).filter(key=>key.startsWith(prefix)&&key.endsWith('.json')).sort();
    coverage[name]={status:paths.length?'PRESENT':'NOT_PRESENT',count:paths.length,paths};
    return paths.map(key=>{const v=value(key);if(!object(v))fail();const id=typeof v.id==='string'&&v.id?v.id:typeof v[idFields[name]]==='string'?v[idFields[name]]:key.slice(key.lastIndexOf('/')+1,-5);return {...v,id,_source_path:key};});
  };
  const records={work:collect('work','entities/work/'),tests:collect('tests','entities/test/'),hypotheses:collect('hypotheses','entities/hypothesis/'),campaigns:collect('campaigns','entities/campaign/'),roadmaps:collect('roadmaps','roadmaps/'),lessons:collect('lessons','entities/lesson/'),interdomain:collect('interdomain','entities/interdomain/'),artifacts:collect('artifacts','entities/artifact/'),events:collect('events','events/'),control,snapshot:value('snapshot/latest.json')||null,activeIndex:value('indexes/active-work.json')||null,coverage,texts:{},evolution:{}};
  const capabilityManifest=value('manifests/capabilities.json');
  records.capabilities=object(capabilityManifest?.capabilities)?capabilityManifest.capabilities:{};
  coverage.capabilities={status:object(capabilityManifest?.capabilities)?'PRESENT':'NOT_PRESENT',count:Object.keys(records.capabilities).length,paths:object(capabilityManifest?.capabilities)?['manifests/capabilities.json']:[]};
  for(const [key,entry] of Object.entries(files)){
    if(key.startsWith('evolution/')&&key.endsWith('.json'))records.evolution[key.slice(10,-5)]=value(key);
    if(entry?.encoding==='text'&&/(?:mcp_server|remote_mcp)\.py$/.test(key))records.texts[key]=String(entry.data??entry.value??'');
  }
  const explicitCampaigns=new Set(records.campaigns.map(row=>row.id));
  for(const roadmap of records.roadmaps){const id=roadmap.campaign_id;if(typeof id==='string'&&id&&!explicitCampaigns.has(id)){records.campaigns.push({...roadmap,id,_derived_from_roadmap:true});explicitCampaigns.add(id);}}
  const sourced=key=>{const v=value(key);return object(v)?{...v,_source_path:key}:null;};
  records.cosmologyState=sourced('snapshot/cosmology_state.json')||sourced('evolution/cosmology_state.json');
  records.cosmologyBaseline=sourced('science/cosmology_world_model.json');
  records.integrity=sourced('indexes/integrity-latest.json');
  for(const event of records.events){
    if(!event.at&&!event.timestamp&&!event.created_at){
      const match=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{6})Z/.exec(String(event.event_id||event.id));
      if(match){const at=`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${match[7].slice(0,3)}Z`;if(Number.isFinite(Date.parse(at))){event.at=at;event._time_basis='CANONICAL_EVENT_ID';}}
    }
  }
  records.sourceUpdatedAt=tower.updated_at;
  records.writeModel=tower.write_model;
  return {records,revision:tower.revision,generatedAt:tower.updated_at,sourceRef:`https://drive.google.com/file/d/${TOWER_ID}/view`};
}
