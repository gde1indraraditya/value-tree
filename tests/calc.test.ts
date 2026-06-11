import { describe, it, expect } from "vitest";
import { childrenOf, contributionShares, evaluate, reorderSiblingsByX } from "@/lib/calc";
import { evaTree, strategicHealthTree } from "@/lib/seed";
import { vnode, vtree } from "./factory";

describe("evaluate — operators", () => {
  it("SUM adds all children", () => {
    const t = vtree("r", [
      vnode({ id: "r", kind: "calculated", operator: "SUM" }),
      vnode({ id: "a", parentId: "r", order: 0, manualValue: 5 }),
      vnode({ id: "b", parentId: "r", order: 1, manualValue: 3 }),
    ]);
    expect(evaluate(t).values.r).toBe(8);
  });

  it("SUBTRACT is first minus the rest (order matters)", () => {
    const t = vtree("r", [
      vnode({ id: "r", kind: "calculated", operator: "SUBTRACT" }),
      vnode({ id: "a", parentId: "r", order: 0, manualValue: 10 }),
      vnode({ id: "b", parentId: "r", order: 1, manualValue: 8 }),
    ]);
    expect(evaluate(t).values.r).toBe(2);
  });

  it("MULTIPLY multiplies all children", () => {
    const t = vtree("r", [
      vnode({ id: "r", kind: "calculated", operator: "MULTIPLY" }),
      vnode({ id: "a", parentId: "r", order: 0, manualValue: 4 }),
      vnode({ id: "b", parentId: "r", order: 1, manualValue: 3 }),
    ]);
    expect(evaluate(t).values.r).toBe(12);
  });

  it("DIVIDE is first over second", () => {
    const t = vtree("r", [
      vnode({ id: "r", kind: "calculated", operator: "DIVIDE" }),
      vnode({ id: "a", parentId: "r", order: 0, manualValue: 10 }),
      vnode({ id: "b", parentId: "r", order: 1, manualValue: 4 }),
    ]);
    expect(evaluate(t).values.r).toBe(2.5);
  });

  it("WEIGHTED is the weighted sum of children", () => {
    const t = vtree(
      "r",
      [
        vnode({ id: "r", kind: "calculated", operator: "WEIGHTED" }),
        vnode({ id: "a", parentId: "r", order: 0, manualValue: 4, weight: 0.5 }),
        vnode({ id: "b", parentId: "r", order: 1, manualValue: 2, weight: 0.5 }),
      ],
      "qualitative",
    );
    expect(evaluate(t).values.r).toBe(3);
  });
});

describe("evaluate — edge cases & validation", () => {
  it("division by zero yields null and an issue", () => {
    const t = vtree("r", [
      vnode({ id: "r", kind: "calculated", operator: "DIVIDE" }),
      vnode({ id: "a", parentId: "r", order: 0, manualValue: 10 }),
      vnode({ id: "b", parentId: "r", order: 1, manualValue: 0 }),
    ]);
    const { values, issues } = evaluate(t);
    expect(values.r).toBeNull();
    expect(JSON.stringify(issues)).toContain("Division by zero");
  });

  it("missing input value yields null and an issue", () => {
    const t = vtree("r", [
      vnode({ id: "r", kind: "calculated", operator: "SUM" }),
      vnode({ id: "a", parentId: "r", order: 0, manualValue: null }),
    ]);
    const { values, issues } = evaluate(t);
    expect(values.r).toBeNull();
    expect(issues.a?.[0]).toMatch(/no value/i);
  });

  it("WEIGHTED with weights not summing to 1 still computes but reports an issue", () => {
    const t = vtree(
      "r",
      [
        vnode({ id: "r", kind: "calculated", operator: "WEIGHTED" }),
        vnode({ id: "a", parentId: "r", order: 0, manualValue: 4, weight: 0.5 }),
        vnode({ id: "b", parentId: "r", order: 1, manualValue: 2, weight: 0.3 }),
      ],
      "qualitative",
    );
    const { values, issues } = evaluate(t);
    expect(values.r).toBeCloseTo(2.6, 5); // 4*0.5 + 2*0.3
    expect(JSON.stringify(issues)).toMatch(/weights sum/i);
  });

  it("detects cycles without crashing", () => {
    const t = vtree("a", [
      vnode({ id: "a", parentId: "b", kind: "calculated", operator: "SUM" }),
      vnode({ id: "b", parentId: "a", kind: "calculated", operator: "SUM" }),
    ]);
    const { issues } = evaluate(t);
    expect(JSON.stringify(issues)).toMatch(/cycle/i);
  });
});

describe("reorderSiblingsByX (operand order from visual position)", () => {
  it("reproduces and fixes the SUBTRACT bug", () => {
    // Angka 2 created first (order 0, x 0); Angka 1 dragged left (order 1, x -240).
    const t = vtree("r", [
      vnode({ id: "r", kind: "calculated", operator: "SUBTRACT" }),
      vnode({ id: "a2", parentId: "r", order: 0, manualValue: 8, position: { x: 0, y: 0 } }),
      vnode({ id: "a1", parentId: "r", order: 1, manualValue: 10, position: { x: -240, y: 0 } }),
    ]);
    expect(evaluate(t).values.r).toBe(-2); // before reorder

    const fixed = reorderSiblingsByX(t, "r");
    expect(fixed.nodes.a1.order).toBe(0); // leftmost becomes operand #1
    expect(fixed.nodes.a2.order).toBe(1);
    expect(evaluate(fixed).values.r).toBe(2); // 10 - 8
  });

  it("is a no-op when order already matches x", () => {
    const t = vtree("r", [
      vnode({ id: "r", kind: "calculated", operator: "SUBTRACT" }),
      vnode({ id: "a", parentId: "r", order: 0, manualValue: 10, position: { x: 0, y: 0 } }),
      vnode({ id: "b", parentId: "r", order: 1, manualValue: 8, position: { x: 200, y: 0 } }),
    ]);
    expect(reorderSiblingsByX(t, "r")).toBe(t); // same reference = unchanged
  });
});

describe("helpers", () => {
  it("childrenOf returns children sorted by order", () => {
    const t = vtree("r", [
      vnode({ id: "r", kind: "calculated", operator: "SUM" }),
      vnode({ id: "b", parentId: "r", order: 1 }),
      vnode({ id: "a", parentId: "r", order: 0 }),
    ]);
    expect(childrenOf(t, "r").map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("contributionShares sums to 1 across children", () => {
    const t = vtree("r", [
      vnode({ id: "r", kind: "calculated", operator: "SUM" }),
      vnode({ id: "a", parentId: "r", order: 0, manualValue: 6 }),
      vnode({ id: "b", parentId: "r", order: 1, manualValue: 2 }),
    ]);
    const shares = contributionShares(t, "r", evaluate(t).values);
    expect(shares.find((s) => s.id === "a")?.share).toBeCloseTo(0.75, 5);
    expect(shares.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 5);
  });
});

describe("seed trees compute the expected roots", () => {
  it("EVA = 10,551.39", () => {
    expect(evaluate(evaTree).values[evaTree.rootId]).toBeCloseTo(10551.386, 2);
  });

  it("Strategic Health = 3.5", () => {
    expect(evaluate(strategicHealthTree).values[strategicHealthTree.rootId]).toBeCloseTo(3.5, 5);
  });
});
