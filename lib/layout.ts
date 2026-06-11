import dagre from "dagre";
import { ValueTree } from "./types";

const NODE_W = 210;
const NODE_H = 92;

type Direction = "TB" | "BT" | "LR" | "RL";

/**
 * Compute a tidy hierarchical layout with dagre and return a NEW tree with
 * updated node positions. Structural-only: call it on add/delete, on a layout
 * toggle, or via the "Auto layout" button — not on every value edit.
 *
 * Direction is taken from `tree.orientation` (vertical → TB, horizontal → RL)
 * unless an explicit direction is passed. Sibling order is then enforced along
 * the cross-axis so the visual order always matches each node's `order`
 * (operand #1 is leftmost in TB, topmost in RL).
 */
export function autoLayout(tree: ValueTree, direction?: Direction): ValueTree {
  const dir: Direction = direction ?? (tree.orientation === "horizontal" ? "RL" : "TB");

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: dir, nodesep: 40, ranksep: 70 });
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

  // Enforce sibling order along the cross-axis (TB/BT spread on x, LR/RL on y),
  // independent of dagre's internal ordering, so operand #1 is always first.
  const crossAxis: "x" | "y" = dir === "TB" || dir === "BT" ? "x" : "y";
  const parentIds = new Set(Object.values(nodes).map((n) => n.parentId).filter(Boolean) as string[]);
  for (const pid of parentIds) {
    const children = Object.values(nodes).filter((n) => n.parentId === pid);
    const slots = children.map((c) => c.position[crossAxis]).sort((a, b) => a - b);
    [...children]
      .sort((a, b) => a.order - b.order)
      .forEach((c, i) => {
        nodes[c.id] = { ...nodes[c.id], position: { ...nodes[c.id].position, [crossAxis]: slots[i] } };
      });
  }

  return { ...tree, nodes };
}
