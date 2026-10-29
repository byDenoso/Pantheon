// Pure validation shared by the guarded frame and workspace payload.
export const WORKSPACE_CONTRACT = 'NEXO_ATLAS_PRIVATE_WORKSPACE_V1';
export const LAB_CONTRACT = 'ATLAS_PRIVATE_WORKSPACE_LAB_V1';
const MAP_KEYS = ['tests','historicalTests','hypotheses','campaigns','roadmaps'] as const;
export function validWorkspaceLab(value: unknown, revision: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row=value as Record<string,unknown>;
  return row.contract===LAB_CONTRACT && row.access==='PRIVATE' && row.source_revision===revision && row.activity_scope==='NOT_INCLUDED_IN_WORKSPACE'
    && MAP_KEYS.every(key=>Array.isArray(row[key]) && (row[key] as unknown[]).every(pair=>Array.isArray(pair)&&pair.length===2&&typeof pair[0]==='string'&&pair[1]&&typeof pair[1]==='object'&&(pair[1] as {id?:unknown}).id===pair[0]) && new Set((row[key] as [string,unknown][]).map(pair=>pair[0])).size===(row[key] as unknown[]).length)
    && Array.isArray(row.missingContract) && typeof row.generatedAt==='string' && typeof row.hasReadModel==='boolean' && Boolean(row.counts&&typeof row.counts==='object') && Boolean(row.reviews&&typeof row.reviews==='object');
}
