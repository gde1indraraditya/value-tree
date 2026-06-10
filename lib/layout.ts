import dagre from "dagre";
import { ValueTree } from "./types";

const NODE_W = 210;
const NODE_H = 92;

/**
 * Compute a tidy top-down hierarchical layout with dagre and return a NEW tree
 * with updated node positions. Structural-only: call it on add/delete or via the
 * "Auto layout" button — not on every value edit (that would make nodes jump).
 */
export function autoLayout(tree: ValueTree, direction: "TB" | "LR" = "TB"): ValueTree {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 70 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of Object.values(tree.nodes)) {
    g.setNode(node.id, { width: NODE_W, height: NODE_H });
  }
  for (const node of Object.values(tree.nodes)) {
    if (node.parentId) g.setEdge(node.parentId, node.id);
  }

  dagre.layout(g);

  const nodes = { ...tree.nodes };
  for (const id of Object.keys(nodes)) {
    const pos = g.node(id);
    if (pos) {
      nodes[id] = {
        ...nodes[id],
        position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      };
    }
  }
  return { ...tree, nodes };
}
