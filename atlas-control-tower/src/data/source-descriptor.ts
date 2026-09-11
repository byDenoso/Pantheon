export type SourceFreshness='LIVE'|'STAGING'|'SNAPSHOT'|'STALE'|'FALLBACK';

export type SourceDescriptorInput={
  contract?:string;
  source?:string;
  freshness?:string;
  sourceVersion?:string;
};

export type SourceDescriptor={
  contract:string;
  label:string;
  freshness:SourceFreshness;
  version?:string;
};

const FRESHNESS=new Set<SourceFreshness>(['LIVE','STAGING','SNAPSHOT','STALE','FALLBACK']);

export function describeSource(input:SourceDescriptorInput={}):SourceDescriptor{
  const contract=input.contract||((input.source||'').toLowerCase()==='v1'?'v1':'legacy');
  const freshness=FRESHNESS.has(input.freshness as SourceFreshness)?input.freshness as SourceFreshness:'SNAPSHOT';
  const label=contract==='v1'?'Projeção canônica':'Snapshot legado';
  return {
    contract,
    label,
    freshness,
    ...(input.sourceVersion?{version:input.sourceVersion}:{}),
  };
}