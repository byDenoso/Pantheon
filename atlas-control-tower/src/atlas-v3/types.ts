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

export type AtlasV3TestGroup={
  id:string;
  projectedType?:'TEST_GROUP'|string;
  label?:string;
  status?:string|null;
  campaignId?:string|null;
  programId?:string|null;
  groupKind?:string|null;
  testCount?:number|null;
  workRef?:string|null;
  migrationOnly?:boolean;
  historicalAccess?:Record<string,unknown>|null;
  terminal?:boolean;
  [key:string]:unknown;
};

export type AtlasV3TestRecord={
  id:string;
  projectedType?:'TEST'|string;
  label?:string;
  status?:string|null;
  testGroupId?:string|null;
  campaignId?:string|null;
  programId?:string|null;
  evidenceClass?:string|null;
  [key:string]:unknown;
};

export type AtlasV3Snapshot={
  manifest:AtlasV3Manifest;
  universe?:{counts?:Record<string,number>};
  graph:{root:AtlasGraph};
  entities?:Record<string,Record<string,unknown>>;
  learning?:{filaments?:Array<Record<string,unknown>>};
  operations?:{works?:Array<Record<string,unknown>>};
  testing?:{
    groups?:AtlasV3TestGroup[];
    tests?:AtlasV3TestRecord[];
    historicalRegistry?:{
      uniqueTests?:number;
      groupCount?:number;
      sourceFileId?:string|null;
      sourceSheetId?:string|number|null;
      sourceTitle?:string|null;
      sourceSheet?:string|null;
      accessMode?:string|null;
      [key:string]:unknown;
    };
  };
  health?:Record<string,unknown>;
  provenance?:Record<string,unknown>;
};

export type AtlasV3Scene={graph:AtlasGraph;focusId:string;canonicalIds:Set<string>;presentationIds:Set<string>};
export type AtlasV3Layer='SCIENCE'|'LEARNING'|'OPERATIONS'|'EVIDENCE'|'PROVENANCE'|'HEALTH';
export type AtlasV3SceneNode=AtlasNode&{presentationOnly?:boolean;layoutParent?:string};
