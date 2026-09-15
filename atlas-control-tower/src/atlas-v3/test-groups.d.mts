import type {AtlasV3Snapshot} from './types';

export declare function isTerminalTestGroup(value:{type?:unknown;projectedType?:unknown}|null|undefined):boolean;
export declare function testGroupHref(groupId:string):string;
export declare function testsForGroup(snapshot:AtlasV3Snapshot|Record<string,unknown>,groupId:string):Array<Record<string,unknown>>;
export declare function groupForId(snapshot:AtlasV3Snapshot|Record<string,unknown>,groupId:string):Record<string,unknown>|null;
export declare function historicalRegistryHref(group:Record<string,unknown>|null|undefined,historicalRegistry:Record<string,unknown>|null|undefined):string|null;
