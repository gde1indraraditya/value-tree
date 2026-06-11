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

// Insertion order (second, then first) is the REVERSE of `order`, so a correct
// cross-axis ordering can only come from honouring `order`, not insertion order.
function crossOrderTree() {
  return vtree("r", [
    vnode({ id: "r", kind: "calculated", operator: "SUM" }),
    vnode({ id: "second", parentId: "r", order: 1, manualValue: 2 }),
    vnode({ id: "first", parentId: "r", order: 0, manualValue: 1 }),
  ]);
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
  dx: Math.abs(a.x - b.x),
  dy: Math.abs(a.y - b.y),
});

describe("autoLayout", () => {
  it("assigns finite positions to every node", () => {
    const out = autoLayout(sampleTree());
    for (const n of Object.values(out.nodes)) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
  });

  it("TB (vertical): parent→child displacement is mainly vertical", () => {
    const out = autoLayout(sampleTree(), "TB");
    const { dx, dy } = dist(out.nodes.a.position, out.nodes.r.position);
    expect(out.nodes.a.position.y).toBeGreaterThan(out.nodes.r.position.y); // child below
    expect(dy).toBeGreaterThan(dx); // vertical flow dominates
  });

  it("RL (horizontal): children are LEFT and flow is mainly horizontal", () => {
    const out = autoLayout(sampleTree(), "RL");
    const { dx, dy } = dist(out.nodes.a.position, out.nodes.r.position);
    expect(out.nodes.a.position.x).toBeLessThan(out.nodes.r.position.x); // child to the left
    expect(out.nodes.b.position.x).toBeLessThan(out.nodes.r.position.x);
    expect(dx).toBeGreaterThan(dy); // horizontal flow dominates
  });

  it("TB: siblings ordered along x by `order` (not insertion order)", () => {
    const out = autoLayout(crossOrderTree(), "TB");
    expect(out.nodes.first.position.x).toBeLessThan(out.nodes.second.position.x);
  });

  it("RL: siblings ordered along y by `order` (top → bottom)", () => {
    const out = autoLayout(crossOrderTree(), "RL");
    expect(out.nodes.first.position.y).toBeLessThan(out.nodes.second.position.y);
  });

  it("derives direction from tree.orientation when not given", () => {
    const out = autoLayout({ ...sampleTree(), orientation: "horizontal" as const });
    const { dx, dy } = dist(out.nodes.a.position, out.nodes.r.position);
    expect(dx).toBeGreaterThan(dy); // horizontal flow ⇒ orientation was honoured
  });

  it("does not mutate the input tree (pure)", () => {
    const t = sampleTree();
    autoLayout(t);
    expect(t.nodes.r.position).toEqual({ x: 0, y: 0 });
  });
});
