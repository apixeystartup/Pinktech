/**
 * Longest-path depth over a directed graph (same idea as test/server topo.ts).
 * Edge direction: "from" -> "to" (e.g. manager role -> subordinate role).
 */

function emptyGraph() {
  return {
    nodes: new Set(),
    incoming: new Map(),
    outgoing: new Map(),
  };
}

function addEdge(g, from, to) {
  if (from === to) return;
  g.nodes.add(from);
  g.nodes.add(to);
  if (!g.outgoing.has(from)) g.outgoing.set(from, new Set());
  if (!g.incoming.has(from)) g.incoming.set(from, new Set());
  if (!g.outgoing.has(to)) g.outgoing.set(to, new Set());
  if (!g.incoming.has(to)) g.incoming.set(to, new Set());
  g.outgoing.get(from).add(to);
  g.incoming.get(to).add(from);
}

function addNode(g, n) {
  g.nodes.add(n);
  if (!g.outgoing.has(n)) g.outgoing.set(n, new Set());
  if (!g.incoming.has(n)) g.incoming.set(n, new Set());
}

function longestDepth(g) {
  const depth = new Map();
  const pendingIn = new Map();
  const queue = [];

  for (const n of g.nodes) {
    const inSize = (g.incoming.get(n) || new Set()).size;
    pendingIn.set(n, inSize);
    if (inSize === 0) {
      depth.set(n, 0);
      queue.push(n);
    }
  }

  while (queue.length) {
    const n = queue.shift();
    const d = depth.get(n) ?? 0;
    for (const child of g.outgoing.get(n) || []) {
      depth.set(child, Math.max(depth.get(child) ?? 0, d + 1));
      const remaining = (pendingIn.get(child) ?? 0) - 1;
      pendingIn.set(child, remaining);
      if (remaining <= 0) queue.push(child);
    }
  }

  for (const n of g.nodes) {
    if (!depth.has(n)) depth.set(n, 0);
  }
  return depth;
}

module.exports = {
  emptyGraph,
  addEdge,
  addNode,
  longestDepth,
};
