import assert from "node:assert";
import { evaluate, reorderSiblingsByX } from "../lib/calc";
import { ValueNode, ValueTree } from "../lib/types";

// Reproduce the mentor's "Test Issue" exactly:
//   Hasil (SUBTRACT)
//     Angka 2  -> created first  => order 0, dragged to x = 0
//     Angka 1  -> created second => order 1, dragged to x = -240 (visually LEFT)
const n = (id: string, parentId: string | null, order: number, label: string, value: number | null, x: number, op: ValueNode["operator"], kind: ValueNode["kind"]): ValueNode => ({
  id, parentId, order, label, unit: "$", kind, operator: op, manualValue: value, weight: 1, target: null, position: { x, y: 0 },
});

const tree: ValueTree = {
  id: "t", name: "Test Issue", businessUnit: "QA", type: "financial", rootId: "hasil",
  nodes: {
    hasil: n("hasil", null, 0, "Hasil", null, 0, "SUBTRACT", "calculated"),
    angka2: n("angka2", "hasil", 0, "Angka 2", 8, 0, "NONE", "input"),
    angka1: n("angka1", "hasil", 1, "Angka 1", 10, -240, "NONE", "input"),
  },
};

// BEFORE the fix (order = creation order): 8 - 10 = -2  (the reported bug)
const before = evaluate(tree).values["hasil"];
console.log("before reorder (creation order):", before);
assert.strictEqual(before, -2, "expected the original buggy result -2");

// AFTER drag → reorder siblings by x (Angka 1 is leftmost ⇒ operand #1)
const fixed = reorderSiblingsByX(tree, "hasil");
assert.strictEqual(fixed.nodes["angka1"].order, 0, "Angka 1 (leftmost) should be operand #1");
assert.strictEqual(fixed.nodes["angka2"].order, 1, "Angka 2 (rightmost) should be operand #2");

const after = evaluate(fixed).values["hasil"];
console.log("after reorder (visual left→right):", after);
assert.strictEqual(after, 2, "expected 10 - 8 = 2 after reordering");

console.log("\n✅ PASS: dragging Angka 1 to the left makes SUBTRACT compute 10 - 8 = 2");
