import type {GraphNode} from './types';

export type GraphNode25D=GraphNode&{
  x:number;
  y:number;
  z:number;
  size:number;
  priority:number;
  depth:number;
  clusterId:string;
  isFocus:boolean;
};

export type GraphOrbit25D={
  id:string;
  x:number;
  y:number;
  width:number;
  height:number;
  z:number;
  rotate:number;
};

export type GraphCluster25D={
  id:string;
  label:string;
  x:number;
  y:number;
  z:number;
  width:number;
  height:number;
};

export type GraphLayout25D={
  focusId:string;
  nodes:GraphNode25D[];
  orbits:GraphOrbit25D[];
  clusters:GraphCluster25D[];
};
