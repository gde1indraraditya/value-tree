import { listTrees } from "@/lib/repo";
import NewTreeForm from "@/components/NewTreeForm";
import TreeList from "@/components/TreeList";

// Always read fresh from the database (no static caching).
export const dynamic = "force-dynamic";

export default async function Home() {
  const trees = await listTrees();
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ marginBottom: 4 }}>Value Tree Builder</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Configurable value driver trees for any business unit — build the tree, assign values
        dynamically, and generate AI insight (anomalies + recommended actions).
      </p>

      <NewTreeForm />

      <h2 style={{ fontSize: 16, marginTop: 32 }}>Your trees</h2>
      <TreeList trees={trees} />

      <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 32 }}>
        Data is stored in PostgreSQL. Trees and edits persist across reloads.
      </p>
    </main>
  );
}
