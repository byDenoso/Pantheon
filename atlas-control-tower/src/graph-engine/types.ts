export type GraphLevel='atlas'|'domain'|'subgraph'|'entity'|'detail';
export type GraphContext={id:string;label:string;path:string};
export type GraphNode={id:string;label:string;type:string;parentId?:string|null;summary?:string|null;status?:string|null;metrics?:Record<string,number|string|null>;x?:number;y?:number;z?:number};
export type GraphEdge={id:string;source:string;target:string;type:string;declared:true;direction?:'forward'|'backward'|'bidirectional'|null;strength?:number|null;metadata?:Record<string,unknown>};
export type GraphOverlay={id:string;type:string;enabled:boolean;nodes?:GraphNode[];edges?:GraphEdge[]};
export type GraphProjection={id:string;version:string;level:GraphLevel;focusId:string|null;nodes:GraphNode[];edges:GraphEdge[];overlays?:GraphOverlay[];parent?:GraphContext|null;breadcrumbs:GraphContext[];capabilities:{drillDown:boolean;learning:boolean;provenance:boolean;search:boolean}};
export type GraphSelection={nodeId:string|null;edgeId:string|null};
export type GraphMachineState={level:GraphLevel;focusId:string|null;selection:GraphSelection;learning:boolean};
