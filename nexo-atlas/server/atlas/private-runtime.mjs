const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fingerprint=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/i.test(value);
const requireValue=value=>{if(!value)throw new Error('PRIVATE_RUNTIME_INVALID');};
// Preserve every source-provided field inside the five typed views. This is a
// classification/coherence boundary, not a public sanitizer or a source compiler.
export function validatePrivateRuntime(data){
  requireValue(object(data)&&data.contract==='NEXO_ATLAS_PRIVATE_RUNTIME_V1'&&data.access==='PRIVATE');
  requireValue(typeof data.generated_at==='string'&&Number.isFinite(Date.parse(data.generated_at))&&typeof data.source_revision==='string'&&data.source_revision.length>0&&data.source_revision.length<=256&&fingerprint(data.fingerprint));
  const {system,world,topology,publication,galaxy}=data,fp=data.fingerprint;
  requireValue(object(system)&&(system.access===undefined||system.access==='PRIVATE')&&system.contract_version==='1'&&system.bus?.fingerprint===fp&&object(system.graph));
  for(const key of ['envelopes','findings','actions','inbox','capabilities','runs','lanes','filaments','providers'])requireValue(Array.isArray(system[key]));
  requireValue(Array.isArray(system.graph.nodes)&&Array.isArray(system.graph.edges));
  for(const row of system.envelopes)requireValue(object(row)&&row.authoritative===false&&row.source_ref&&row.fingerprint&&object(row.freshness));
  requireValue(object(world)&&world.version==='1'&&world.access==='PRIVATE'&&object(world.truthGraph)&&Array.isArray(world.truthGraph.results)&&object(world.diff));
  for(const key of ['items','providers','contexts','issues'])requireValue(Array.isArray(world[key]));
  for(const row of world.items)requireValue(object(row)&&row.id&&row.sourceRef&&object(row.freshness)&&Array.isArray(row.actions));
  requireValue(object(topology)&&topology.contract==='NEXO_MCP_TOPOLOGY_V1'&&topology.access==='PRIVATE'&&Array.isArray(topology.nodes)&&Array.isArray(topology.links)&&object(topology.stats)&&topology.source?.projection_fingerprint===fp);
  requireValue(object(publication)&&publication.contract==='NEXO_PRIVATE_PROJECTION_PUBLICATION_V1'&&publication.access==='PRIVATE'&&publication.manifest?.access==='PRIVATE'&&publication.manifest?.projection_fingerprint===fp&&publication.build_meta?.projection_fingerprint===fp);
  requireValue(object(galaxy)&&galaxy.contract==='NEXO_ONE_GALAXY_V1'&&galaxy.access==='PRIVATE'&&fingerprint(galaxy.fingerprint)&&galaxy.tower_revision===data.source_revision&&galaxy.provenance?.source_fingerprint===fp&&galaxy.provenance?.source_contract==='NEXO_ATLAS_PRIVATE_RUNTIME_V1'&&object(galaxy.stats));
  for(const key of ['entities','events','relations','needs_you'])requireValue(Array.isArray(galaxy[key]));
  for(const key of ['entities','relations','needs_you'])requireValue(galaxy.stats[key]===galaxy[key].length);
  const ids=new Set();
  for(const row of galaxy.entities){requireValue(object(row)&&typeof row.id==='string'&&row.id&&!ids.has(row.id)&&['x','y','z'].every(key=>Number.isFinite(row.layout?.[key]))&&row.observation?.access!=='PUBLIC_PROJECTION');ids.add(row.id);if(row.source?.projection_fingerprint)requireValue(row.source.projection_fingerprint===fp);}
  return {contract:data.contract,access:'PRIVATE',generated_at:data.generated_at,source_revision:data.source_revision,fingerprint:fp,system,world,topology,publication,galaxy};
}
