// Wire shape for the exact Lab values used by the current private workspace.
// Retired activity views are deliberately outside this profile, never reported as source-empty.
import type {Lab} from '../features/lab/model.ts';
import type {SystemState} from '../contracts/system.ts';
import {buildLab} from '../features/lab/model.ts';
import {LAB_CONTRACT,validWorkspaceLab} from './workspace-contract.ts';
export {WORKSPACE_CONTRACT,validWorkspaceLab} from './workspace-contract.ts';
const MAP_KEYS = ['tests','historicalTests','hypotheses','campaigns','roadmaps'] as const;
export function serializeWorkspaceLab(lab: Lab, revision: string) {
  const {activity, ...rest} = lab;
  return {...rest,contract:LAB_CONTRACT,access:'PRIVATE',source_revision:revision,activity_scope:'NOT_INCLUDED_IN_WORKSPACE',
    ...Object.fromEntries(MAP_KEYS.map(key=>[key,[...(lab[key] ?? new Map())]]))};
}
export function workspaceLab(state: SystemState): Lab {
  const row=(state as unknown as {workspace_lab?: Record<string,unknown>}).workspace_lab;
  if (!row) return buildLab(state);
  if (!validWorkspaceLab(row,state.bus.fingerprint)) throw new Error('WORKSPACE_LAB_INVALID');
  const {contract,access,source_revision,activity_scope,...values}=row;
  return {...values,...Object.fromEntries(MAP_KEYS.map(key=>[key,new Map(row[key] as [string,unknown][])])),activity:[]} as unknown as Lab;
}
