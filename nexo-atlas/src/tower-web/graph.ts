// Graph theory primitives for the Tower web. Pure, deterministic, no DOM. Iterative where depth could be large.
// Nodes are string ids; edges are directed pairs [source, target]. Unknown endpoints and self-loops are ignored by the
// metrics that do not define them (articulation points, betweenness); duplicates are collapsed.

export type Edge = readonly [string, string];

export type Index = {ids: string[]; idx: Map<string, number>; out: number[][]; inn: number[][]; und: number[][]};

/** Adjacency over integer indices. `und` is the simple undirected skeleton (no self-loops, no duplicates). */
export function indexGraph(ids: readonly string[], edges: readonly Edge[]): Index {
  const list = [...new Set(ids)];
  const idx = new Map(list.map((id, i) => [id, i] as const));
  const out: number[][] = list.map(() => []), inn: number[][] = list.map(() => []);
  const und: Array<Set<number>> = list.map(() => new Set());
  const seen = new Set<string>();
  for (const [a, b] of edges) {
    const i = idx.get(a), j = idx.get(b);
    if (i === undefined || j === undefined) continue;
    const key = `${i}>${j}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out[i]!.push(j); inn[j]!.push(i);
    if (i !== j) { und[i]!.add(j); und[j]!.add(i); }
  }
  return {ids: list, idx, out, inn, und: und.map(s => [...s].sort((x, y) => x - y))};
}

/** Weakly connected components (union-find over the undirected skeleton). Largest first, ties by first id. */
export function components(g: Index): string[][] {
  const parent = g.ids.map((_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; } return x; };
  g.und.forEach((nb, i) => nb.forEach(j => { const a = find(i), b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }));
  const groups = new Map<number, string[]>();
  g.ids.forEach((id, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(id); });
  return [...groups.values()].map(c => c.sort()).sort((a, b) => b.length - a.length || a[0]!.localeCompare(b[0]!));
}

/** Tarjan SCC, iterative. comp[i] is the component index; components come out in reverse topological order. */
export function stronglyConnected(g: Index): {comp: number[]; count: number} {
  const n = g.ids.length;
  const index = new Array<number>(n).fill(-1), low = new Array<number>(n).fill(0), onStack = new Array<boolean>(n).fill(false);
  const comp = new Array<number>(n).fill(-1);
  const stack: number[] = [];
  let counter = 0, count = 0;
  for (let s = 0; s < n; s += 1) {
    if (index[s] !== -1) continue;
    const work: Array<[number, number]> = [[s, 0]];
    index[s] = low[s] = counter++; stack.push(s); onStack[s] = true;
    while (work.length) {
      const top = work[work.length - 1]!;
      const v = top[0];
      if (top[1] < g.out[v]!.length) {
        const w = g.out[v]![top[1]++]!;
        if (index[w] === -1) { index[w] = low[w] = counter++; stack.push(w); onStack[w] = true; work.push([w, 0]); }
        else if (onStack[w]) low[v] = Math.min(low[v]!, index[w]!);
      } else {
        work.pop();
        if (work.length) { const p = work[work.length - 1]![0]; low[p] = Math.min(low[p]!, low[v]!); }
        if (low[v] === index[v]) {
          let w: number;
          do { w = stack.pop()!; onStack[w] = false; comp[w] = count; } while (w !== v);
          count += 1;
        }
      }
    }
  }
  return {comp, count};
}

/** Nodes that sit on a directed cycle (SCC of size > 1, or a self-loop). */
export function cyclicNodes(g: Index): Set<string> {
  const {comp, count} = stronglyConnected(g);
  const size = new Array<number>(count).fill(0);
  comp.forEach(c => { size[c]! += 1; });
  const out = new Set<string>();
  g.ids.forEach((id, i) => { if (size[comp[i]!]! > 1 || g.out[i]!.includes(i)) out.add(id); });
  return out;
}

/**
 * Longest-path layering of the condensation (cycles collapse to one layer) and the critical path: the longest chain of
 * dependencies, as node ids from root cause to last consequence. Edge a->b means "b depends on a" (a is a prerequisite).
 */
export function layering(g: Index): {layer: Map<string, number>; criticalPath: string[]; depth: number} {
  const {comp, count} = stronglyConnected(g);
  const succ: Array<Set<number>> = Array.from({length: count}, () => new Set());
  const indeg = new Array<number>(count).fill(0);
  g.out.forEach((nb, i) => nb.forEach(j => { const a = comp[i]!, b = comp[j]!; if (a !== b && !succ[a]!.has(b)) { succ[a]!.add(b); indeg[b]! += 1; } }));
  const layer = new Array<number>(count).fill(0), prev = new Array<number>(count).fill(-1);
  const queue: number[] = [];
  for (let c = 0; c < count; c += 1) if (indeg[c] === 0) queue.push(c);
  for (let h = 0; h < queue.length; h += 1) {
    const c = queue[h]!;
    for (const d of [...succ[c]!].sort((x, y) => x - y)) {
      if (layer[c]! + 1 > layer[d]!) { layer[d] = layer[c]! + 1; prev[d] = c; }
      indeg[d]! -= 1; if (indeg[d] === 0) queue.push(d);
    }
  }
  const members = Array.from({length: count}, () => [] as string[]);
  g.ids.forEach((id, i) => members[comp[i]!]!.push(id));
  members.forEach(m => m.sort());
  let end = 0;
  for (let c = 1; c < count; c += 1) if (layer[c]! > layer[end]! || (layer[c] === layer[end] && members[c]![0]! < members[end]![0]!)) end = c;
  const path: string[] = [];
  for (let c = count ? end : -1; c !== -1; c = prev[c]!) path.unshift(...members[c]!);
  return {layer: new Map(g.ids.map((id, i) => [id, layer[comp[i]!]!] as const)), criticalPath: count ? path : [], depth: count ? layer[end]! : 0};
}

/** Articulation points of the undirected skeleton (iterative Tarjan low-link): removing one splits its component. */
export function articulationPoints(g: Index): Set<string> {
  const n = g.ids.length;
  const disc = new Array<number>(n).fill(-1), low = new Array<number>(n).fill(0), par = new Array<number>(n).fill(-1);
  const cut = new Array<boolean>(n).fill(false);
  let t = 0;
  for (let s = 0; s < n; s += 1) {
    if (disc[s] !== -1) continue;
    let rootChildren = 0;
    const work: Array<[number, number]> = [[s, 0]];
    disc[s] = low[s] = t++;
    while (work.length) {
      const top = work[work.length - 1]!; const v = top[0];
      if (top[1] < g.und[v]!.length) {
        const w = g.und[v]![top[1]++]!;
        if (disc[w] === -1) { par[w] = v; disc[w] = low[w] = t++; if (v === s) rootChildren += 1; work.push([w, 0]); }
        else if (w !== par[v]) low[v] = Math.min(low[v]!, disc[w]!);
      } else {
        work.pop();
        const p = par[v]!;
        if (p !== -1) { low[p] = Math.min(low[p]!, low[v]!); if (p !== s && low[v]! >= disc[p]!) cut[p] = true; }
      }
    }
    if (rootChildren > 1) cut[s] = true;
  }
  return new Set(g.ids.filter((_, i) => cut[i]));
}

/**
 * Brandes betweenness on the undirected skeleton, normalised to [0,1] by (n-1)(n-2)/2. Exact (no sampling), O(V·E).
 */
export function betweenness(g: Index): Map<string, number> {
  const n = g.ids.length;
  const cb = new Array<number>(n).fill(0);
  const sigma = new Array<number>(n), dist = new Array<number>(n), delta = new Array<number>(n);
  const pred: number[][] = Array.from({length: n}, () => []);
  for (let s = 0; s < n; s += 1) {
    sigma.fill(0); dist.fill(-1); delta.fill(0); for (const p of pred) p.length = 0;
    sigma[s] = 1; dist[s] = 0;
    const order: number[] = [s];
    for (let h = 0; h < order.length; h += 1) {
      const v = order[h]!;
      for (const w of g.und[v]!) {
        if (dist[w] === -1) { dist[w] = dist[v]! + 1; order.push(w); }
        if (dist[w] === dist[v]! + 1) { sigma[w]! += sigma[v]!; pred[w]!.push(v); }
      }
    }
    for (let k = order.length - 1; k > 0; k -= 1) {
      const w = order[k]!;
      for (const v of pred[w]!) delta[v]! += (sigma[v]! / sigma[w]!) * (1 + delta[w]!);
      cb[w]! += delta[w]!;
    }
  }
  const norm = n > 2 ? (n - 1) * (n - 2) : 1; // directed-pair count; each undirected pair was counted twice
  return new Map(g.ids.map((id, i) => [id, n > 2 ? cb[i]! / norm : 0] as const));
}

/** Quotient (contracted) graph weights: number of edges between each unordered pair of groups, groupOf(id) -> group. */
export function quotientWeights(edges: readonly Edge[], groupOf: (id: string) => string | undefined): Map<string, number> {
  const w = new Map<string, number>();
  for (const [a, b] of edges) {
    const ga = groupOf(a), gb = groupOf(b);
    if (ga === undefined || gb === undefined || ga === gb) continue;
    const key = ga < gb ? `${ga}\u0000${gb}` : `${gb}\u0000${ga}`;
    w.set(key, (w.get(key) ?? 0) + 1);
  }
  return w;
}
export const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
