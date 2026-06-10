# Value Tree — Architecture

A configurable value driver tree builder: define any tree (any business unit),
assign values dynamically, see the whole tree recompute live, and generate AI
insight (anomaly detection + action recommendations).

## 1. Layers

```
┌──────────────────────────────────────────────────────────────┐
│ React (client)                                               │
│   ValueTreeEditor ── React Flow canvas + custom ValueNode    │
│   InsightPanel                                               │
│        │ derives values every render via evaluate()          │
├──────────────────────────────────────────────────────────────┤
│ Domain core (pure TS, shared client+server) — lib/           │
│   types.ts   the single shape (mirrors DB)                   │
│   calc.ts    evaluate(): bottom-up, cycle-safe, pure         │
│   layout.ts  dagre auto-layout                               │
│   insight.ts anomaly + recommendation engine                 │
├──────────────────────────────────────────────────────────────┤
│ Next.js route handlers (server)                              │
│   POST /api/insight → generateInsight() (Claude or heuristic)│
│   [prod] /api/trees CRUD → PostgreSQL                        │
├──────────────────────────────────────────────────────────────┤
│ PostgreSQL — trees, nodes, snapshots, insights (db/schema.sql)│
└──────────────────────────────────────────────────────────────┘
```

**Key principle:** the tree object is the single source of truth. The UI never
stores computed numbers — it derives them from `evaluate(tree)` on every change.
That eliminates the #1 bug class in spreadsheet-style tools: stale cached values.

## 2. Data model

One generic, recursive node table (adjacency list) — never one table per
business unit. Each node carries its own rollup rule:

| field        | meaning                                                      |
|--------------|--------------------------------------------------------------|
| `kind`       | `input` (user types value) or `calculated` (derived)         |
| `operator`   | how children roll up: SUM / SUBTRACT / MULTIPLY / DIVIDE / WEIGHTED |
| `sort_order` | sibling order — makes SUBTRACT/DIVIDE deterministic          |
| `weight`     | child's weight toward a WEIGHTED parent (qualitative scoring) |
| `target`     | optional baseline → powers anomaly detection                 |

Reads use a **recursive CTE** (`WITH RECURSIVE`) to pull a whole tree in one
query. For very large trees, add an `ltree` path column for indexed subtree reads.

## 3. Calculation engine (`lib/calc.ts`)

- **Pure & bottom-up.** `evaluate(tree)` returns `{ values, issues }` without
  mutating input. Post-order DFS, each node visited once → O(nodes).
- **Cycle-safe.** A `visiting`/`done` colouring detects loops and records an
  issue instead of overflowing the stack.
- **Defensive.** Division-by-zero, missing inputs, and weight-sum ≠ 1 surface as
  per-node issues (shown on the node and in the insight panel).
- **Operator semantics** are the only thing that differs between a *financial*
  tree (SUM/SUBTRACT/MULTIPLY/DIVIDE) and a *qualitative* tree (WEIGHTED). Same
  table, same engine, same editor — `tree.type` just changes which operators the
  UI offers. (This is why supporting both types is low-risk.)

## 4. Two tree types

| | Financial | Qualitative |
|-|-----------|-------------|
| Parent value | formula over children | weighted average of child scores |
| Example | EVA = NOPAT − (WACC × Invested Capital) | Strategic Health = Σ(driver × weight) |
| Validation | MECE, divide-by-zero | child weights sum to 1.0 |

## 5. AI Insight (`lib/insight.ts`, `/api/insight`)

Flow: serialize the tree to a compact outline (label, value, target, operator) →
send to the model → return `{ summary, anomalies[], recommendations[] }`.

- **Anomaly detection:** target deviation ≥ threshold, plus engine issues
  (weights, divide-by-zero, missing inputs).
- **Recommendations:** trace the *dominant driver path* (root → highest-
  contribution child, repeatedly) and prioritise off-target nodes on that path —
  the levers with the biggest impact on the root metric.
- **Provider:** prefers Claude (`ANTHROPIC_API_KEY`) and **always** degrades to
  the deterministic heuristic when the key is absent or the call fails, so the
  feature never hard-fails. Runs server-side to keep the key off the client.

## 6. Prototype vs production

| Concern        | Prototype (this repo)        | Production                          |
|----------------|------------------------------|-------------------------------------|
| Persistence    | in-memory seed (`lib/seed`)  | PostgreSQL (`db/schema.sql`)        |
| Values         | manual entry                 | manual → later: data-source sync    |
| AI             | heuristic + optional Claude  | Claude + cached `insights` rows     |
| Multi-tenant   | n/a                          | `owner_id`, row-level security      |

## 7. Why these libraries

- **React Flow (`@xyflow/react`)** — production node-canvas (Stripe, Zapier,
  Retool). Drag/zoom/pan/minimap out of the box; nodes are plain React.
- **dagre** — deterministic hierarchical auto-layout so trees stay tidy.
- **Next.js App Router** — server route handlers keep the AI key server-side and
  give a clean path to PostgreSQL CRUD.
