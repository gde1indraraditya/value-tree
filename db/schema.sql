-- ===========================================================================
-- Value Tree — PostgreSQL schema (production design)
-- ---------------------------------------------------------------------------
-- Design choices:
--   * One generic node table (adjacency list via parent_id) — NOT one table
--     per business unit. The tree is fully user-defined / dynamic.
--   * Operator + kind live ON the node, so every node carries its own rollup
--     rule. This keeps the calc engine simple and auditable.
--   * Reads of a whole tree/subtree use a recursive CTE (see bottom).
--   * Snapshots let users save what-if scenarios and compare them.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- Enums keep bad data out at the DB layer and document the domain.
CREATE TYPE tree_type AS ENUM ('financial', 'qualitative');
CREATE TYPE node_kind AS ENUM ('input', 'calculated');
CREATE TYPE node_operator AS ENUM ('SUM', 'SUBTRACT', 'MULTIPLY', 'DIVIDE', 'WEIGHTED', 'NONE');

-- ---------------------------------------------------------------------------
-- trees
-- ---------------------------------------------------------------------------
CREATE TABLE trees (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT        NOT NULL,
    business_unit TEXT        NOT NULL,
    type          tree_type   NOT NULL,
    -- Layout: existing trees are 'vertical'; the app creates new ones 'horizontal'.
    orientation   TEXT        NOT NULL DEFAULT 'vertical'
                  CHECK (orientation IN ('vertical', 'horizontal')),
    root_id       UUID,                       -- FK added after nodes exists
    owner_id      UUID,                       -- who owns this tree
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- nodes  (adjacency list: each node points to its parent)
-- ---------------------------------------------------------------------------
CREATE TABLE nodes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tree_id      UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
    parent_id    UUID REFERENCES nodes(id) ON DELETE CASCADE,
    sort_order   INT  NOT NULL DEFAULT 0,     -- sibling order: drives SUBTRACT/DIVIDE
    label        TEXT NOT NULL,
    unit         TEXT NOT NULL DEFAULT '',
    kind         node_kind     NOT NULL DEFAULT 'input',
    operator     node_operator NOT NULL DEFAULT 'NONE',
    manual_value NUMERIC,                     -- value for input nodes (NULL = unset)
    weight       NUMERIC NOT NULL DEFAULT 1,  -- weight toward parent (WEIGHTED parents)
    target       NUMERIC,                     -- baseline for anomaly detection
    pos_x        DOUBLE PRECISION NOT NULL DEFAULT 0,
    pos_y        DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A calculated node must declare a real operator; an input node must not.
    CONSTRAINT chk_kind_operator CHECK (
        (kind = 'calculated' AND operator <> 'NONE') OR
        (kind = 'input'      AND operator =  'NONE')
    )
);

ALTER TABLE trees
    ADD CONSTRAINT fk_trees_root FOREIGN KEY (root_id) REFERENCES nodes(id);

CREATE INDEX idx_nodes_tree   ON nodes(tree_id);
CREATE INDEX idx_nodes_parent ON nodes(parent_id);

-- ---------------------------------------------------------------------------
-- snapshots  (what-if scenarios / version history)
-- Store the full node set as JSONB so a scenario is one immutable row.
-- ---------------------------------------------------------------------------
CREATE TABLE snapshots (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tree_id    UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,                 -- e.g. "Sales -10% scenario"
    payload    JSONB NOT NULL,                -- frozen array of node rows
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_snapshots_tree ON snapshots(tree_id);

-- ---------------------------------------------------------------------------
-- insights  (cache generated AI insight so repeat views are free)
-- ---------------------------------------------------------------------------
CREATE TABLE insights (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tree_id      UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
    generated_by TEXT NOT NULL,               -- 'claude' | 'heuristic'
    payload      JSONB NOT NULL,              -- { summary, anomalies, recommendations }
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_insights_tree ON insights(tree_id);

-- ===========================================================================
-- Read the whole tree (or a subtree) in one round-trip with a recursive CTE.
-- :tree_id is the bind parameter.
-- ===========================================================================
-- WITH RECURSIVE subtree AS (
--     SELECT *, 0 AS depth
--     FROM nodes
--     WHERE tree_id = :tree_id AND parent_id IS NULL
--   UNION ALL
--     SELECT n.*, s.depth + 1
--     FROM nodes n
--     JOIN subtree s ON n.parent_id = s.id
-- )
-- SELECT * FROM subtree ORDER BY depth, sort_order;
--
-- Tip: for very large / deep trees, add a materialized `path` column
-- (ltree extension) so you can fetch any subtree with a single indexed
-- `path <@ :ancestor_path` lookup instead of recursion.
