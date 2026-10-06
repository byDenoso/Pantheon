// Parent <-> private frame protocol. Both directions require origin AND source checks,
// and data is only ever posted with an explicit same-origin targetOrigin (never '*').
export const HOST = 'atlas-private-host';
export const FRAME = 'atlas-private-frame';

export type ToFrame =
  | {channel: typeof HOST; type: 'RUNTIME'; data: unknown}
  | {channel: typeof HOST; type: 'RUNTIME_REFRESH'; id: string; data: unknown}
  | {channel: typeof HOST; type: 'REFRESH_FAILED'; id: string; code: string}
  /** the shell's current language preference; presentation only, carries no data */
  | {channel: typeof HOST; type: 'LOCALE'; locale: FrameLocale}
  | {channel: typeof HOST; type: 'TEARDOWN'};
export const FRAME_LOCALES = ['pt-BR', 'en'] as const;
export type FrameLocale = typeof FRAME_LOCALES[number];
export const isFrameLocale = (v: unknown): v is FrameLocale => typeof v === 'string' && (FRAME_LOCALES as readonly string[]).includes(v);
/** Ids are opaque correlation tokens chosen by the frame; the parent only echoes them. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
export type FromFrame =
  | {channel: typeof FRAME; type: 'READY'}
  | {channel: typeof FRAME; type: 'ACCEPTED'}
  | {channel: typeof FRAME; type: 'SESSION_ACTION'; action: 'logout'}
  | {channel: typeof FRAME; type: 'REFRESH'; id: string}
  | {channel: typeof FRAME; type: 'ERROR'; code: string};

type Ev = {origin: string; source: unknown; data: unknown};
const rec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function trusted(ev: Ev, expectedOrigin: string, expectedSource: unknown): boolean {
  return expectedOrigin !== 'null' && expectedOrigin !== '' && ev.origin === expectedOrigin && expectedSource != null && ev.source === expectedSource;
}
export function parseFromFrame(data: unknown): FromFrame | null {
  if (!rec(data) || data.channel !== FRAME) return null;
  if (data.type === 'READY') return {channel: FRAME, type: 'READY'};
  if (data.type === 'ACCEPTED') return {channel: FRAME, type: 'ACCEPTED'};
  if (data.type === 'SESSION_ACTION' && data.action === 'logout') return {channel: FRAME, type: 'SESSION_ACTION', action: 'logout'};
  if (data.type === 'REFRESH' && typeof data.id === 'string' && ID.test(data.id)) return {channel: FRAME, type: 'REFRESH', id: data.id};
  if (data.type === 'ERROR' && typeof data.code === 'string') return {channel: FRAME, type: 'ERROR', code: data.code.slice(0, 64)};
  return null;
}
export function parseToFrame(data: unknown): ToFrame | null {
  if (!rec(data) || data.channel !== HOST) return null;
  if (data.type === 'RUNTIME') return {channel: HOST, type: 'RUNTIME', data: data.data};
  if (data.type === 'RUNTIME_REFRESH' && typeof data.id === 'string' && ID.test(data.id)) return {channel: HOST, type: 'RUNTIME_REFRESH', id: data.id, data: data.data};
  if (data.type === 'REFRESH_FAILED' && typeof data.id === 'string' && ID.test(data.id) && typeof data.code === 'string') return {channel: HOST, type: 'REFRESH_FAILED', id: data.id, code: data.code.slice(0, 64)};
  if (data.type === 'LOCALE' && isFrameLocale(data.locale)) return {channel: HOST, type: 'LOCALE', locale: data.locale};
  if (data.type === 'TEARDOWN') return {channel: HOST, type: 'TEARDOWN'};
  return null;
}
