import { ValueNode, ValueTree } from "./types";

// Small helper to keep the seed declarations terse and consistent.
type Seed = Omit<ValueNode, "position">;

function build(id: string, name: string, businessUnit: string, type: ValueTree["type"], orientation: ValueTree["orientation"], rootId: string, seeds: Seed[]): ValueTree {
  const nodes: Record<string, ValueNode> = {};
  for (const s of seeds) nodes[s.id] = { ...s, position: { x: 0, y: 0 } };
  return { id, name, businessUnit, type, orientation, rootId, nodes };
}

const n = (
  id: string,
  parentId: string | null,
  order: number,
  label: string,
  unit: string,
  kind: ValueNode["kind"],
  operator: ValueNode["operator"],
  manualValue: number | null,
  opts: { weight?: number; target?: number | null } = {},
): Seed => ({
  id,
  parentId,
  order,
  label,
  unit,
  kind,
  operator,
  manualValue,
  weight: opts.weight ?? 1,
  target: opts.target ?? null,
});

// ---------------------------------------------------------------------------
// FINANCIAL: Economic Value Added (EVA) — mirrors the PlanMagic reference tree.
//   EVA = NOPAT - (WACC x Invested Capital)
// A few targets are seeded so the anomaly detector has something to flag.
// ---------------------------------------------------------------------------
export const evaTree: ValueTree = build("eva-demo", "EVA Value Tree (2010)", "Corporate Finance", "financial", "horizontal", "eva", [
  n("eva", null, 0, "EVA", "$", "calculated", "SUBTRACT", null),
  n("nopat", "eva", 0, "NOPAT", "$", "calculated", "MULTIPLY", null),
  n("capCharge", "eva", 1, "Capital Charge", "$", "calculated", "MULTIPLY", null),

  n("ebit", "nopat", 0, "EBIT", "$", "calculated", "SUBTRACT", null),
  n("taxFactor", "nopat", 1, "(1 − Tax Rate)", "x", "input", "NONE", 0.67),

  n("grossProfit", "ebit", 0, "Gross Profit", "$", "calculated", "SUBTRACT", null),
  n("totalOpex", "ebit", 1, "Total Operating Expenses", "$", "calculated", "SUM", null),

  n("sales", "grossProfit", 0, "Sales", "$", "input", "NONE", 108000, { target: 120000 }),
  n("cogs", "grossProfit", 1, "Cost of Goods Sold", "$", "input", "NONE", 25068, { target: 22000 }),

  n("opEx", "totalOpex", 0, "Operating Expenses", "$", "input", "NONE", 60000, { target: 58000 }),
  n("otherEx", "totalOpex", 1, "Other Expenses", "$", "input", "NONE", 4238),

  n("wacc", "capCharge", 0, "WACC", "x", "input", "NONE", 0.061),
  n("investedCapital", "capCharge", 1, "Total Invested Capital", "$", "calculated", "SUBTRACT", null),

  n("totalAssets", "investedCapital", 0, "Total Assets", "$", "calculated", "SUM", null),
  n("ifLiab", "investedCapital", 1, "Interest-free Liabilities", "$", "input", "NONE", 60113),

  n("currentAssets", "totalAssets", 0, "Current Assets", "$", "input", "NONE", 33704),
  n("fixedAssets", "totalAssets", 1, "Fixed Assets", "$", "input", "NONE", 58763),
]);

// ---------------------------------------------------------------------------
// QUALITATIVE: Strategic Health — weighted 1–5 scoring, no financial formulas.
//   Demonstrates the SAME engine/editor handling a non-financial tree.
// ---------------------------------------------------------------------------
export const strategicHealthTree: ValueTree = build("health-demo", "Strategic Health Scorecard", "Strategy Office", "qualitative", "vertical", "health", [
  n("health", null, 0, "Strategic Health", "score", "calculated", "WEIGHTED", null),
  n("people", "health", 0, "People", "score", "calculated", "WEIGHTED", null, { weight: 0.4 }),
  n("customer", "health", 1, "Customer", "score", "input", "NONE", 3, { weight: 0.35, target: 4 }),
  n("execution", "health", 2, "Execution", "score", "input", "NONE", 5, { weight: 0.25 }),

  n("retention", "people", 0, "Talent Retention", "score", "input", "NONE", 4, { weight: 0.5 }),
  n("engagement", "people", 1, "Engagement", "score", "input", "NONE", 2, { weight: 0.5, target: 4 }),
]);

export const seedTrees: Record<string, ValueTree> = {
  [evaTree.id]: evaTree,
  [strategicHealthTree.id]: strategicHealthTree,
};
