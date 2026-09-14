// Pure picking decision for the 3D scene: given a clicked node, does it drill down
// (open) or just select (show in the shell's inspector)? Kept out of AtlasCanvas.tsx
// so the exact rule -- and that the node's own id is what gets passed through,
// never a different id -- has a real behavior test.
export type PickableNode = {
  id: string;
  type?: string;
  childCount?: number;
  childrenCount?: number;
};

export type PickableEdge = { source: string; target: string };

const CAN_REVEAL_DESCENDANTS = new Set(['ROOT', 'SYSTEM', 'DOMAIN', 'PROGRAM', 'CAMPAIGN', 'SUBGRAPH']);

export function shouldOpenNode(node: PickableNode, focusId: string, edges: PickableEdge[]): boolean {
  if (node.id === focusId) return false;
  const structuralType = String(node.type || '').toUpperCase();
  const canRevealDescendants = CAN_REVEAL_DESCENDANTS.has(structuralType);
  const hasChildren =
    Number(node.childCount ?? node.childrenCount ?? 0) > 0 ||
    edges.some(edge => edge.source === node.id && edge.target !== node.id) ||
    canRevealDescendants;
  return hasChildren;
}
