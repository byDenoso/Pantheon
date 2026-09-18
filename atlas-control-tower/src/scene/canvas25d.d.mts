import type {AtlasEdge,AtlasNode} from './types';

export type Canvas25DMeta={level:number;domain:string;connections:number;importance:number;parentId:string|null};
export type Canvas25DPoint=Canvas25DMeta&{id:string;x:number;y:number;z:number};
export type Canvas25DCamera={scale:number;panX:number;panY:number};

export const PRESENTATION_ROOT:string;
export const DOMAIN_PREFIX:string;
export function buildStructuralIndex(nodes:AtlasNode[],edges?:AtlasEdge[]):Map<string,Canvas25DMeta>;
export function buildCanvas25DLayout(nodes:AtlasNode[],edges?:AtlasEdge[]):Canvas25DPoint[];
export function radiusForImportance(meta:Canvas25DMeta|undefined,options?:{cluster?:boolean;root?:boolean}):number;
export function zoomCameraAt(camera:Canvas25DCamera,anchor:{x:number;y:number},viewport:{width:number;height:number},nextScale:number):Canvas25DCamera;
export function stateRole(status:unknown):'attention'|'pending'|'healthy'|'neutral';
