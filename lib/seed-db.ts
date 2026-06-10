import { randomUUID } from "crypto";
import { importTree } from "./repo";
import { seedTrees } from "./seed";
import { ValueTree } from "./types";

// Stable UUIDs so re-seeding is idempotent (importTree skips if the id exists).
const FIXED_TREE_IDS: Record<string, string> = {
  "eva-demo": "11111111-1111-4111-8111-111111111111",
  "health-demo": "22222222-2222-4222-8222-222222222222",
};

// The seed trees use readable slug ids (eva, nopat, ...) but the DB uses UUIDs.
// Remap every id to a UUID while keeping parent/root references consistent.
function remapToUuids(tree: ValueTree): ValueTree {
  const map = new Map<string, string>();
  const idFor = (old: string) => {
    if (!map.has(old)) map.set(old, randomUUID());
    return map.get(old)!;
  };
  const nodes: ValueTree["nodes"] = {};
  for (const n of Object.values(tree.nodes)) {
    const nid = idFor(n.id);
    nodes[nid] = { ...n, id: nid, parentId: n.parentId ? idFor(n.parentId) : null };
  }
  return {
    ...tree,
    id: FIXED_TREE_IDS[tree.id] ?? randomUUID(),
    rootId: idFor(tree.rootId),
    nodes,
  };
}

/** Idempotently load the example trees into PostgreSQL. Safe to run repeatedly. */
export async function seedDatabase(): Promise<{ imported: string[]; skipped: string[] }> {
  const imported: string[] = [];
  const skipped: string[] = [];
  for (const tree of Object.values(seedTrees)) {
    const did = await importTree(remapToUuids(tree));
    (did ? imported : skipped).push(tree.name);
  }
  return { imported, skipped };
}
