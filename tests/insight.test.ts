import { describe, it, expect } from "vitest";
import { evaluate } from "@/lib/calc";
import { heuristicInsight, serializeTree } from "@/lib/insight";
import { vnode, vtree } from "./factory";

function profitTree() {
  // Profit = Revenue - Cost ; Revenue is 17% below its target.
  return vtree("r", [
    vnode({ id: "r", label: "Profit", unit: "$", kind: "calculated", operator: "SUBTRACT" }),
    vnode({ id: "rev", label: "Revenue", unit: "$", parentId: "r", order: 0, manualValue: 100, target: 120 }),
    vnode({ id: "cost", label: "Cost", unit: "$", parentId: "r", order: 1, manualValue: 30 }),
  ]);
}

describe("heuristicInsight", () => {
  it("flags a node that misses its target as an anomaly", () => {
    const t = profitTree();
    const insight = heuristicInsight(t, evaluate(t));
    expect(insight.generatedBy).toBe("heuristic");
    expect(insight.anomalies.map((a) => a.label)).toContain("Revenue");
    const revenue = insight.anomalies.find((a) => a.label === "Revenue");
    expect(revenue?.detail).toMatch(/-17%/);
  });

  it("produces at least one recommendation for an off-target dominant driver", () => {
    const t = profitTree();
    const insight = heuristicInsight(t, evaluate(t));
    expect(insight.recommendations.length).toBeGreaterThan(0);
    expect(insight.recommendations[0].label).toBe("Revenue");
  });

  it("reports a weight mismatch as a structural anomaly", () => {
    const t = vtree(
      "r",
      [
        vnode({ id: "r", label: "Score", unit: "score", kind: "calculated", operator: "WEIGHTED" }),
        vnode({ id: "a", label: "A", parentId: "r", order: 0, manualValue: 4, weight: 0.5 }),
        vnode({ id: "b", label: "B", parentId: "r", order: 1, manualValue: 2, weight: 0.2 }),
      ],
      "qualitative",
    );
    const insight = heuristicInsight(t, evaluate(t));
    expect(JSON.stringify(insight.anomalies)).toMatch(/weights sum/i);
  });

  it("reports no target breaches when everything is on target", () => {
    const t = vtree("r", [
      vnode({ id: "r", label: "Total", unit: "$", kind: "calculated", operator: "SUM" }),
      vnode({ id: "a", label: "A", parentId: "r", order: 0, manualValue: 50, target: 50 }),
      vnode({ id: "b", label: "B", parentId: "r", order: 1, manualValue: 50, target: 50 }),
    ]);
    const insight = heuristicInsight(t, evaluate(t));
    expect(insight.anomalies).toHaveLength(0);
  });
});

describe("serializeTree", () => {
  it("includes node labels and computed values", () => {
    const t = profitTree();
    const text = serializeTree(t, evaluate(t));
    expect(text).toContain("Profit");
    expect(text).toContain("Revenue");
    expect(text).toMatch(/target 120/);
  });
});
