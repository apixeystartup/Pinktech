/**
 * Generic longest-path topological-sort helper. Identical behaviour to
 * ``role_engine.infer_levels`` in the Python codebase - given a directed
 * graph of nodes (e.g. role-to-role reporting edges) it returns each
 * node's depth from the deepest ancestor.
 *
 *   nodes        = ["GM", "SM", "BM"]
 *   incoming     = { GM: [], SM: ["GM"], BM: ["SM"] }
 *   outgoing     = { GM: ["SM"], SM: ["BM"], BM: [] }
 *   longestDepth -> { GM: 0, SM: 1, BM: 2 }
 *
 * Cycles (which shouldn't appear in a real reporting graph) leave their
 * members at depth 0 - the caller decides whether to treat that as a
 * warning or an error.
 */
export interface DepthGraph {
  nodes: Set<string>;
  incoming: Map<string, Set<string>>;
  outgoing: Map<string, Set<string>>;
}

export function emptyGraph(): DepthGraph {
  return {
    nodes: new Set(),
    incoming: new Map(),
    outgoing: new Map(),
  };
}

export function addEdge(g: DepthGraph, from: string, to: string): void {
  if (from === to) return; // self-loops carry no hierarchy signal
  g.nodes.add(from);
  g.nodes.add(to);
  if (!g.outgoing.has(from)) g.outgoing.set(from, new Set());
  if (!g.incoming.has(from)) g.incoming.set(from, new Set());
  if (!g.outgoing.has(to)) g.outgoing.set(to, new Set());
  if (!g.incoming.has(to)) g.incoming.set(to, new Set());
  g.outgoing.get(from)!.add(to);
  g.incoming.get(to)!.add(from);
}

export function addNode(g: DepthGraph, n: string): void {
  g.nodes.add(n);
  if (!g.outgoing.has(n)) g.outgoing.set(n, new Set());
  if (!g.incoming.has(n)) g.incoming.set(n, new Set());
}

export function longestDepth(g: DepthGraph): Map<string, number> {
  const depth = new Map<string, number>();
  const pendingIn = new Map<string, number>();
  const queue: string[] = [];

  for (const n of g.nodes) {
    const inSize = (g.incoming.get(n) || new Set()).size;
    pendingIn.set(n, inSize);
    if (inSize === 0) {
      depth.set(n, 0);
      queue.push(n);
    }
  }

  while (queue.length) {
    const n = queue.shift()!;
    const d = depth.get(n) ?? 0;
    for (const child of g.outgoing.get(n) || []) {
      depth.set(child, Math.max(depth.get(child) ?? 0, d + 1));
      const remaining = (pendingIn.get(child) ?? 0) - 1;
      pendingIn.set(child, remaining);
      if (remaining <= 0) queue.push(child);
    }
  }

  // Defensive default for any node trapped in a cycle.
  for (const n of g.nodes) if (!depth.has(n)) depth.set(n, 0);
  return depth;
}
