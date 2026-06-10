// ---------------------------------------------------------------------------
// Core domain types — shared by the editor, calculation engine, and AI insight.
// These mirror the PostgreSQL schema in /db/schema.sql so the same shape flows
// from DB -> API -> client without translation.
// ---------------------------------------------------------------------------

/** A tree is either a quantitative (formula-driven) or qualitative (scoring) model. */
export type TreeType = "financial" | "qualitative";

/**
 * How a *calculated* node combines its (ordered) children.
 *  - SUM:      c0 + c1 + c2 ...
 *  - SUBTRACT: c0 - (c1 + c2 + ...)     (order matters)
 *  - MULTIPLY: c0 * c1 * c2 ...
 *  - DIVIDE:   c0 / c1                  (exactly two children)
 *  - WEIGHTED: Σ (ci.value * ci.weight) (qualitative scoring; weights ~ sum to 1)
 *  - NONE:     leaf — value is entered manually (an input node)
 */
export type Operator =
  | "SUM"
  | "SUBTRACT"
  | "MULTIPLY"
  | "DIVIDE"
  | "WEIGHTED"
  | "NONE";

/** input = user types the number; calculated = derived from children via operator. */
export type NodeKind = "input" | "calculated";

export interface ValueNode {
  id: string;
  parentId: string | null;
  /** Sibling order — drives operator semantics (subtract/divide) and layout. */
  order: number;
  label: string;
  /** Display unit, e.g. "$", "%", "score". Purely cosmetic for the engine. */
  unit: string;
  kind: NodeKind;
  /** How children roll up into this node. Ignored when kind === "input". */
  operator: Operator;
  /** Manually entered value for input nodes. null = not yet provided. */
  manualValue: number | null;
  /** Weight toward the parent — only used when the PARENT operator is WEIGHTED. */
  weight: number;
  /** Optional baseline/target used by anomaly detection. null = no target. */
  target: number | null;
  /** Canvas position (persisted so layouts are stable across reloads). */
  position: { x: number; y: number };
}

export interface ValueTree {
  id: string;
  name: string;
  businessUnit: string;
  type: TreeType;
  rootId: string;
  /** Flat map keyed by node id — O(1) access, mirrors a flat DB table. */
  nodes: Record<string, ValueNode>;
}

/** Result of evaluating a tree: computed value + any per-node error/warning. */
export interface EvalResult {
  /** Computed numeric value per node id (null when not computable). */
  values: Record<string, number | null>;
  /** Per-node problems (cycle, divide-by-zero, weight mismatch, missing input). */
  issues: Record<string, string[]>;
}
