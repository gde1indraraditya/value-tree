import { describe, it, expect } from "vitest";
import { autoLayout } from "@/lib/layout";
import { vnode, vtree } from "./factory";

function sampleTree() {
  return vtree("r", [
    vnode({ id: "r", kind: "calculated", operator: "SUM" }),
    vnode({ id: "a", parentId: "r", order: 0, manualValue: 1 }),
    vnode({ id: "b", parentId: "r", order: 1, manualValue: 2 }),
  ]);
}

describe("autoLayout", () => {
  it("assigns finite positions to every node", () => {
    const out = autoLayout(sampleTree());
    for (const n of Object.values(out.nodes)) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
  });

  it("TB (vertical): children sit below their parent", () => {
    const out = autoLayout(sampleTree(), "TB");
    expect(out.nodes.a.position.y).toBeGreaterThan(out.nodes.r.position.y);
    expect(out.nodes.b.position.y).toBeGreaterThan(out.nodes.r.position.y);
  });

  it("does not mutate the input tree (pure)", () => {
    const t = sampleTree();
    autoLayout(t);
    expect(t.nodes.r.position).toEqual({ x: 0, y: 0 });
  });
});
