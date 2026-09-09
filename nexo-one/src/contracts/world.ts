export type ProviderId = 'drive'|'gmail'|'calendar'|'github'|'vercel'|'nexo'|'atlas';
export type ProviderStatus = 'AVAILABLE'|'STALE'|'UNAVAILABLE'|'AUTH_REQUIRED'|'RATE_LIMITED';
export type Attention = 'IGNORE'|'NOTICE'|'ACT'|'ESCALATE';
export type LoopStatus = 'NEEDS_ME'|'WAITING_OTHER'|'SCHEDULED'|'BLOCKED'|'DONE';
export type ContextId = 'NEXO'|'COSMOLOGY'|'OLYMPUS'|'ENGINEERING'|'PERSONAL';
export interface Freshness { state:'LIVE'|'SNAPSHOT'|'STALE'; observedAt:string; expiresAt:string }
export interface CockpitAction { id:string; label:string; kind:'OPEN_SOURCE'; url:string }
export interface CockpitItem {
  id:string; kind:'FILE'|'MESSAGE'|'EVENT'|'ISSUE'|'DEPLOYMENT'|'ACTION'|'ENTITY';
  title:string; summary?:string; source:ProviderId; sourceRef:string;
  authority:'CANONICAL'|'PROVIDER'|'DERIVED'; freshness:Freshness;
  contextId?:ContextId; attention:Attention; attentionReason?:string; status?:LoopStatus;
  dueAt?:string; endAt?:string; allDay?:boolean; waitingOn?:string[];
  nextAction?:string; priority?:'HIGH'|'NORMAL'; actions:CockpitAction[]; observedAt:string;
}
export interface ProviderState { id:ProviderId; label:string; status:ProviderStatus; lastSuccessAt:string|null; checkedAt:string; revision:string|null; message:string; partial:boolean; count:number|null }
export interface ContextPack { id:ContextId; title:string; description:string; itemIds:string[]; attentionCount:number; coverage:'AVAILABLE'|'PARTIAL'|'UNAVAILABLE' }
export interface WorldDiff { previous:string|null; current:string; added:string[]; updated:string[]; removed:string[]; providerChanges:ProviderId[] }
export interface WorldState { version:'1'; fingerprint:string; generatedAt:string; providers:ProviderState[]; items:CockpitItem[]; contexts:ContextPack[]; issues:{provider:ProviderId; code:string}[]; diff:WorldDiff; access:'PUBLIC'|'PRIVATE' }
