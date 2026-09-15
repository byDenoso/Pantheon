import type {AtlasGraph,AtlasNode} from '../scene/types';

export type AtlasV3Manifest={
  contractVersion:string;
  schemaVersion?:string;
  projectionVersion?:string;
  fingerprint:string;
  sourceVersion?:string;
  generatedAt?:string;
  authority:'TOWER_V06';
  truthOwner?:string;
  projectionOnly:true;
  completeness?:string;
  freshness?:string;
  snapshotPath?:string;
};

export type AtlasV3Snapshot={
  manifest:AtlasV3Manifest;
  universe?:{counts?:Record<string,number>};
  graph:{root:AtlasGraph};
  entities?:Record<string,Record<string,unknown>>;
  learning?:{filaments?:Array<Record<string,unknown>>};
  operations?:{works?:Array<Record<string,unknown>>};
  health?:Record<string,unknown>;
  provenance?:Record<string,unknown>;
};

export type AtlasV3Scene={graph:AtlasGraph;focusId:string;canonicalIds:Set<string>;presentationIds:Set<string>};
export type AtlasV3Layer='SCIENCE'|'LEARNING'|'OPERATIONS'|'EVIDENCE'|'PROVENANCE'|'HEALTH';
export type AtlasV3SceneNode=AtlasNode&{presentationOnly?:boolean;layoutParent?:string};
