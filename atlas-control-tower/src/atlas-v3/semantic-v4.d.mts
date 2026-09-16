import type {AtlasGraph,AtlasNode} from '../scene/types';
import type {AtlasV3Scene} from './types';

export const PRIMARY_DOMAINS: readonly string[];
export const OVERLAYS: readonly string[];

export function semanticDepthForNode(node:Partial<AtlasNode>):number;
export function semanticDomainForNode(node:Partial<AtlasNode>|null|undefined):'NEXO'|'SCIENCE'|'OPERATIONS'|'HEALTH'|'UNCLASSIFIED';
export function focusIdForPrimaryDomain(domain:string):string;
export function overlayAvailability(scene:AtlasV3Scene):Record<'LEARNING'|'AUTOMATIONS'|'EVIDENCE',number>;
export function graphForSemanticContext(scene:AtlasV3Scene,domain?:string,overlays?:string[]):AtlasGraph;
export function buildSemanticVisibility(graph:AtlasGraph,options?:{focusId?:string;selectedId?:string;level?:number;budget?:number}):Set<string>;
export function serializeSemanticLocation(location?:{domain?:string;focusId?:string;selectedId?:string;overlays?:string[];level?:number}):string;
export function parseSemanticLocation(value:unknown):{domain:string;focusId:string;selectedId:string;overlays:string[];level:number}|null;
export function diffSnapshots(previous:unknown,next:unknown):{added:string[];removed:string[];updated:string[]};
