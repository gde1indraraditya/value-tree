import { pool, query } from "./db";
import { NodeKind, Operator, TreeType, ValueNode, ValueTree } from "./types";

export interface TreeSummary {
  id: string;
  name: string;
  businessUnit: string;
  type: TreeType;
  nodeCount: number;
}

// pg returns NUMERIC columns as strings (to preserve precision); convert safely.
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

interface NodeRow {
  id: string;
  parent_id: string | null;
  sort_order: number;
  label: string;
  unit: string;
  kind: NodeKind;
  operator: Operator;
  manual_value: string | null;
  weight: string;
  target: string | null;
  pos_x: number;
  pos_y: number;
}

function rowToNode(r: NodeRow): ValueNode {
  return {
    id: r.id,
    parentId: r.parent_id,
    order: r.sort_order,
    label: r.label,
    unit: r.unit,
    kind: r.kind,
    operator: r.operator,
    manualValue: num(r.manual_value),
    weight: num(r.weight) ?? 1,
    target: num(r.target),
    position: { x: r.pos_x, y: r.pos_y },
  };
}

/** List all trees with a node count for the home page. */
export async function listTrees(): Promise<TreeSummary[]> {
  const rows = await query<{
    id: string;
    name: string;
    business_unit: string;
    type: TreeType;
    node_count: string;
  }>(
    `SELECT t.id, t.name, t.business_unit, t.type,
            COUNT(n.id) AS node_count
       FROM trees t
       LEFT JOIN nodes n ON n.tree_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    businessUnit: r.business_unit,
    type: r.type,
    nodeCount: Number(r.node_count),
  }));
}

/** Load one full tree. Uses a recursive CTE so nodes come back parent-before-child. */
export async function getTree(id: string): Promise<ValueTree | null> {
  const treeRows = await query<{
    id: string;
    name: string;
    business_unit: string;
    type: TreeType;
    root_id: string | null;
  }>(`SELECT id, name, business_unit, type, root_id FROM trees WHERE id = $1`, [id]);
  const t = treeRows[0];
  if (!t) return null;

  const nodeRows = await query<NodeRow>(
    `WITH RECURSIVE subtree AS (
        SELECT *, 0 AS depth FROM nodes WHERE tree_id = $1 AND parent_id IS NULL
      UNION ALL
        SELECT n.*, s.depth + 1 FROM nodes n JOIN subtree s ON n.parent_id = s.id
     )
     SELECT id, parent_id, sort_order, label, unit, kind, operator,
            manual_value, weight, target, pos_x, pos_y
       FROM subtree ORDER BY depth, sort_order`,
    [id],
  );

  const nodes: Record<string, ValueNode> = {};
  for (const r of nodeRows) nodes[r.id] = rowToNode(r);

  return {
    id: t.id,
    name: t.name,
    businessUnit: t.business_unit,
    type: t.type,
    rootId: t.root_id ?? "",
    nodes,
  };
}

/** Create a new tree with a single root input node, return the full tree. */
export async function createTree(input: {
  name: string;
  businessUnit: string;
  type: TreeType;
}): Promise<ValueTree> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const treeRes = await client.query<{ id: string }>(
      `INSERT INTO trees (name, business_unit, type) VALUES ($1, $2, $3) RETURNING id`,
      [input.name, input.businessUnit, input.type],
    );
    const treeId = treeRes.rows[0].id;
    const rootRes = await client.query<{ id: string }>(
      `INSERT INTO nodes (tree_id, parent_id, sort_order, label, unit, kind, operator, manual_value, weight)
       VALUES ($1, NULL, 0, $2, $3, 'input', 'NONE', 0, 1) RETURNING id`,
      [treeId, "Root metric", input.type === "qualitative" ? "score" : "$"],
    );
    await client.query(`UPDATE trees SET root_id = $1 WHERE id = $2`, [rootRes.rows[0].id, treeId]);
    await client.query("COMMIT");
    const tree = await getTree(treeId);
    if (!tree) throw new Error("Failed to load created tree");
    return tree;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Persist the full tree: transactional replace of all nodes.
 * Order of operations matters because of FK constraints:
 *   1. detach root_id, 2. delete old nodes, 3. insert nodes parent-before-child,
 *   4. re-point root_id + update tree metadata.
 */
export async function saveTree(tree: ValueTree): Promise<void> {
  const ordered = topoSort(tree); // parents before children
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE trees SET root_id = NULL WHERE id = $1`, [tree.id]);
    await client.query(`DELETE FROM nodes WHERE tree_id = $1`, [tree.id]);
    for (const n of ordered) {
      await client.query(
        `INSERT INTO nodes
           (id, tree_id, parent_id, sort_order, label, unit, kind, operator, manual_value, weight, target, pos_x, pos_y)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          n.id,
          tree.id,
          n.parentId,
          n.order,
          n.label,
          n.unit,
          n.kind,
          n.operator,
          n.manualValue,
          n.weight,
          n.target,
          n.position.x,
          n.position.y,
        ],
      );
    }
    await client.query(
      `UPDATE trees SET root_id = $1, name = $2, business_unit = $3, type = $4, updated_at = now() WHERE id = $5`,
      [tree.rootId || null, tree.name, tree.businessUnit, tree.type, tree.id],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteTree(id: string): Promise<void> {
  await query(`DELETE FROM trees WHERE id = $1`, [id]); // nodes cascade
}

/** Lightweight metadata update (rename / change business unit) — no node rewrite. */
export async function renameTree(id: string, name: string): Promise<void> {
  await query(`UPDATE trees SET name = $1, updated_at = now() WHERE id = $2`, [name, id]);
}

/** Insert a complete tree with explicit ids (used for seeding). No-op if it exists. */
export async function importTree(tree: ValueTree): Promise<boolean> {
  const existing = await query(`SELECT 1 FROM trees WHERE id = $1`, [tree.id]);
  if (existing.length > 0) return false;
  await query(
    `INSERT INTO trees (id, name, business_unit, type) VALUES ($1, $2, $3, $4)`,
    [tree.id, tree.name, tree.businessUnit, tree.type],
  );
  await saveTree(tree); // populates nodes + sets root_id
  return true;
}

/** Insert order: root first, then breadth-first so every parent precedes its children. */
function topoSort(tree: ValueTree): ValueNode[] {
  const out: ValueNode[] = [];
  const childrenByParent = new Map<string | null, ValueNode[]>();
  for (const n of Object.values(tree.nodes)) {
    const k = n.parentId;
    if (!childrenByParent.has(k)) childrenByParent.set(k, []);
    childrenByParent.get(k)!.push(n);
  }
  const queue = [...(childrenByParent.get(null) ?? [])];
  while (queue.length) {
    const n = queue.shift()!;
    out.push(n);
    queue.push(...(childrenByParent.get(n.id) ?? []));
  }
  // Safety net: include any nodes not reachable from a root (shouldn't happen).
  if (out.length !== Object.keys(tree.nodes).length) {
    const seen = new Set(out.map((n) => n.id));
    for (const n of Object.values(tree.nodes)) if (!seen.has(n.id)) out.push(n);
  }
  return out;
}
