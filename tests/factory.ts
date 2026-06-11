import { TreeType, ValueNode, ValueTree } from "@/lib/types";

/** Build a ValueNode with sensible defaults; override only what the test needs. */
export function vnode(partial: Partial<ValueNode> & { id: string }): ValueNode {
  return {
    parentId: null,
    order: 0,
    label: partial.id,
    unit: "",
    kind: "input",
    operator: "NONE",
    manualValue: null,
    weight: 1,
    target: null,
    position: { x: 0, y: 0 },
    ...partial,
  };
}

/** Assemble a ValueTree from a flat list of nodes. */
export function vtree(rootId: string, nodes: ValueNode[], type: TreeType = "financial"): ValueTree {
  const map: Record<string, ValueNode> = {};
  for (const n of nodes) map[n.id] = n;
  return { id: "t", name: "test", businessUnit: "QA", type, rootId, nodes: map };
}
