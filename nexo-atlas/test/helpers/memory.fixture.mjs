import {makePrivateTowerFixture} from './private-tower.fixture.mjs';
import {canonicalDigest} from '../../server/atlas/json-stream.mjs';
export function memoryFixture(){
 const tower=makePrivateTowerFixture();
 const data={
  'entities/test/T-1.json':{id:'T-1',kind:'TEST',domain:'SCIENCE',question:'Expansion cosmologique',status:'PROVISIONAL',entity_version:4,hypothesis_id:'H-1',result:{value:1.25,interpretation:'Candidate, not confirmed'},semantic:{topic_id:'science.expansion'}},
  'entities/hypothesis/H-1.json':{id:'H-1',kind:'HYPOTHESIS',domain:'SCIENCE',title:'Hubble expansion',status:'DRAFT',test_ids:['T-1']},
  'entities/artifact/FB-1.json':{id:'FB-1',kind:'LEARNING_SIGNAL',entity_version:1,payload:{scope:'RETRIEVAL_QUALITY_ONLY',scientific_authority:false,retrieval_feedback:{outcome:'HELPFUL'},refs:['T-1']}},
  'evolution/learning.json':{rules:[{id:'RULE-1',feature:'small_sample',value:'review',status:'RECORDED'}]},
  'evolution/board.json':{posts:[{id:'POST-1',text:'Compare repeated observations',status:'OPEN'}]},
  'entities/test/PEER-PRIVATE.json':{id:'PEER-PRIVATE',domain:'PEER',title:'NEVER_MEMORY_PEER'},
  'entities/artifact/PRIVATE-CROSS.json':{id:'PRIVATE-CROSS',payload:{target_domains:['OLYMPUS']},title:'NEVER_CROSS_DOMAIN'},
 };
 for(const [path,value] of Object.entries(data))tower.files[path]={encoding:'json',value};
 tower.file_count=Object.keys(tower.files).length;tower.revision=tower.state_fingerprint=canonicalDigest(tower.files);return tower;
}
