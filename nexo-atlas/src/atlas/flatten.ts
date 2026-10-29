// Bounded, generic renderer model for private payloads. The shape is unknown by design.
export type Row = {path: string; value: string};
export function flattenData(data: Record<string, unknown>, maxDepth = 4, maxRows = 200): {rows: Row[]; omitted: number} {
  const rows: Row[] = [];
  let omitted = 0;
  const walk = (v: unknown, path: string, depth: number) => {
    if (rows.length >= maxRows) { omitted++; return; }
    if (v !== null && typeof v === 'object' && depth < maxDepth) {
      const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v as Record<string, unknown>);
      if (!entries.length) { if (path) rows.push({path, value: Array.isArray(v) ? '[]' : '{}'}); return; }
      for (const [k, x] of entries) walk(x, path ? `${path}.${k}` : k, depth + 1);
      return;
    }
    const s = typeof v === 'string' ? v : v !== null && typeof v === 'object' ? '…' : String(v);
    rows.push({path, value: s.length > 300 ? `${s.slice(0, 300)}…` : s});
  };
  walk(data, '', 0);
  return {rows, omitted};
}
