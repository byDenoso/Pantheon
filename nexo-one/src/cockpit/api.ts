// Same-origin client for the private cockpit. The session cookie is HttpOnly; nothing
// private is stored in the browser.
export type Bi = {'pt-BR': string; en: string};
export type TowerPublic = {question: Bi; answers: Bi; method: Bi; result: Bi};
export type CampaignPublic = {question: Bi; why: Bi | null; currentStage: Bi | null; nextStep: Bi | null; closure: Bi | null};
export type Row = Record<string, string>;
export type Selection = {
  contract: 'NEXO_PUBLIC_SELECTION_V1'; version: number; updatedAt: string | null; catalog: string[];
  tower: Array<{id: string; digest: string; approvedAt: string; public: TowerPublic}>;
  campaigns: Array<{id: string; digest: string; approvedAt: string; state: 'ongoing' | 'completed'; public: CampaignPublic}>;
};
export type Audit = {at: string; version: number; catalog: {count: number; added: number; removed: number}; tower: {count: number; added: number; removed: number}; campaigns: {count: number; added: number; removed: number}};
export type ShadowTab = 'roadmap' | 'mural' | 'resumo' | 'resultados' | 'equipe';
export type ShadowAvailability = 'available' | 'unavailable' | 'unknown';
export type Cockpit = {
  contract: 'NEXO_COCKPIT_V1'; generatedAt: string;
  shadow: {available: true; modifiedAt: string | null; counts: Record<string, number>; availability?: Partial<Record<ShadowTab,ShadowAvailability>>; equipe: Row[]; roadmap: Row[]; resultados: Row[]; resumo: Row[]; mural: Row[]} | {available: false; reason: string};
  catalog: {available: true; url: string; rows: Array<{key: string; question: Bi; published_at: string | null}>} | {available: false; reason: string};
  candidates: {tower: Array<{id: string; digest: string; source: Row; draft: TowerPublic}>; campaigns: Array<{id: string; digest: string; source: Row; draft: {question: Bi; why: Bi; currentStage: Bi; nextStep: Bi}}>};
  selection: {available: true; value: Selection | null} | {available: false; reason: string};
  drift: Array<{kind: 'tower' | 'campaigns'; id: string; status: 'CHANGED' | 'MISSING'}>;
  audit: Audit[];
};
export type SaveBody = {expectedVersion: number; catalog: string[]; tower: Array<{id: string; public: TowerPublic}>; campaigns: Array<{id: string; state: 'ongoing' | 'completed'; public: CampaignPublic}>};
export type SaveError = {kind: string; id: string; field?: string; code: string};

export class HttpError extends Error {
  constructor(public status: number, public code: string, public detail: Record<string, unknown> = {}) { super(code); }
}
const BASE: RequestInit = {credentials: 'same-origin', cache: 'no-store', redirect: 'error'};
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try { res = await fetch(path, {...BASE, ...init, headers: {Accept: 'application/json', ...(init.headers as Record<string, string> | undefined)}}); }
  catch { throw new HttpError(0, 'NETWORK'); }
  let body: Record<string, unknown> = {};
  try { body = await res.json(); } catch { throw new HttpError(res.status, res.status === 404 ? 'NOT_DEPLOYED' : 'CONTRACT'); }
  if (!res.ok) throw new HttpError(res.status, typeof body.error === 'string' ? body.error : 'HTTP_' + res.status, body);
  return body as T;
}
export const session = () => call<{configured: boolean; authenticated: boolean; expiresAt?: string}>('/api/atlas-session');
export const login = (pin: string) => call<{authenticated: true; expiresAt: string}>('/api/atlas-session', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({pin})});
export const logout = () => call<{authenticated: false}>('/api/atlas-session', {method: 'DELETE', keepalive: true});
export const loadCockpit = (signal?: AbortSignal) => call<Cockpit>('/api/atlas-cockpit', {signal});
export const saveSelection = (body: SaveBody) => call<{saved: true; version: number; updatedAt: string}>('/api/atlas-cockpit-selection', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});

export const loadPublicSelection = () => call<{contract: 'ATLAS_PUBLIC_SELECTION_V1'; mode: 'UNSET' | 'LIVE'; version?: number}>('/api/atlas-public-selection');
