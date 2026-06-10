import { EvalResult, Operator, ValueNode, ValueTree } from "./types";

/** Return the ordered children of a node. */
export function childrenOf(tree: ValueTree, nodeId: string): ValueNode[] {
  return Object.values(tree.nodes)
    .filter((n) => n.parentId === nodeId)
    .sort((a, b) => a.order - b.order);
}

/**
 * Evaluate an entire tree bottom-up.
 *
 * Design notes (best practice):
 *  - Pure function: never mutates the input tree. The UI keeps the tree as the
 *    single source of truth and derives computed values on every change.
 *  - Cycle-safe: a DFS with a "visiting" set detects cycles and records an issue
 *    instead of blowing the stack.
 *  - Memoized: each node is evaluated once per call (post-order), so the cost is
 *    O(nodes), not exponential, even for deep/shared structures.
 */
export function evaluate(tree: ValueTree): EvalResult {
  const values: Record<string, number | null> = {};
  const issues: Record<string, string[]> = {};
  const state: Record<string, "visiting" | "done"> = {};

  const addIssue = (id: string, msg: string) => {
    (issues[id] ||= []).push(msg);
  };

  const visit = (id: string): number | null => {
    if (state[id] === "done") return values[id];
    if (state[id] === "visiting") {
      addIssue(id, "Cycle detected — node is part of a loop.");
      return null;
    }
    const node = tree.nodes[id];
    if (!node) return null;
    state[id] = "visiting";

    let result: number | null;
    if (node.kind === "input") {
      result = node.manualValue;
      if (result === null) addIssue(id, "Input has no value yet.");
    } else {
      const children = childrenOf(tree, id);
      if (children.length === 0) {
        addIssue(id, "Calculated node has no children.");
        result = null;
      } else {
        const childVals = children.map((c) => visit(c.id));
        result = combine(node.operator, children, childVals, addIssue, id);
      }
    }

    values[id] = result;
    state[id] = "done";
    return result;
  };

  // Evaluate from the root, then sweep any orphan nodes so the editor still
  // shows their values while the user is mid-edit.
  visit(tree.rootId);
  for (const id of Object.keys(tree.nodes)) if (state[id] !== "done") visit(id);

  return { values, issues };
}

/** Apply a node's operator to its children's values. */
function combine(
  op: Operator,
  children: ValueNode[],
  vals: (number | null)[],
  addIssue: (id: string, msg: string) => void,
  parentId: string,
): number | null {
  // If any child is missing we cannot compute a trustworthy parent.
  if (vals.some((v) => v === null)) return null;
  const v = vals as number[];

  switch (op) {
    case "SUM":
      return v.reduce((a, b) => a + b, 0);
    case "SUBTRACT":
      return v.slice(1).reduce((a, b) => a - b, v[0]);
    case "MULTIPLY":
      return v.reduce((a, b) => a * b, 1);
    case "DIVIDE": {
      if (v.length !== 2) {
        addIssue(parentId, "DIVIDE expects exactly two children.");
        return null;
      }
      if (v[1] === 0) {
        addIssue(parentId, "Division by zero.");
        return null;
      }
      return v[0] / v[1];
    }
    case "WEIGHTED": {
      const totalWeight = children.reduce((a, c) => a + c.weight, 0);
      if (Math.abs(totalWeight - 1) > 0.001) {
        addIssue(
          parentId,
          `Child weights sum to ${totalWeight.toFixed(2)}, expected 1.00.`,
        );
      }
      return children.reduce((a, c, i) => a + v[i] * c.weight, 0);
    }
    case "NONE":
      addIssue(parentId, "Calculated node has operator NONE.");
      return null;
    default:
      return null;
  }
}

/**
 * Rank the children of a target node by how much each contributes to it.
 * Used by AI insight + the UI "what drives this?" affordance.
 * Returns share in [0,1] (absolute contribution / total absolute contribution).
 */
export function contributionShares(
  tree: ValueTree,
  parentId: string,
  values: Record<string, number | null>,
): { id: string; label: string; value: number; share: number }[] {
  const parent = tree.nodes[parentId];
  if (!parent) return [];
  const children = childrenOf(tree, parentId);

  const contrib = children.map((c) => {
    const cv = values[c.id] ?? 0;
    let signed: number;
    switch (parent.operator) {
      case "WEIGHTED":
        signed = cv * c.weight;
        break;
      default:
        signed = cv;
    }
    return { id: c.id, label: c.label, value: cv, magnitude: Math.abs(signed) };
  });

  const total = contrib.reduce((a, c) => a + c.magnitude, 0) || 1;
  return contrib.map(({ id, label, value, magnitude }) => ({
    id,
    label,
    value,
    share: magnitude / total,
  }));
}
