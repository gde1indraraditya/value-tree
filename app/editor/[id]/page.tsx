import { notFound } from "next/navigation";
import ValueTreeEditor from "@/components/ValueTreeEditor";
import { getTree } from "@/lib/repo";

// Load the tree from PostgreSQL on the server.
export const dynamic = "force-dynamic";

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tree = await getTree(id);
  if (!tree) notFound();
  return <ValueTreeEditor initialTree={tree} />;
}
