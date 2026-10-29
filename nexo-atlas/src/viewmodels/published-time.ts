/** Invalid, absent and future timestamps never attest freshness. */
export function publishedAgeMs(value?: string | null, now = Date.now()): number | null {
  const at = value ? Date.parse(value) : NaN;
  return Number.isFinite(now) && Number.isFinite(at) && at <= now ? now - at : null;
}

export function isPublishedFresh(value?: string | null, maxAgeMs = 45 * 60_000, now = Date.now()): boolean {
  const age = publishedAgeMs(value, now);
  return age !== null && age <= maxAgeMs;
}

export function formatPublishedAge(value?: string | null, now = Date.now()): string {
  if (!value) return 'data não publicada';
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return 'data inválida';
  if (!Number.isFinite(now) || at > now) return 'data futura';
  const minutes = Math.floor((now - at) / 60_000);
  return minutes < 1 ? 'agora' : minutes < 60 ? `há ${minutes} min` : minutes < 1440 ? `há ${Math.floor(minutes / 60)} h` : `há ${Math.floor(minutes / 1440)} d`;
}
