"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TreeSummary } from "@/lib/repo"; // type-only: not bundled to client

export default function TreeList({ trees }: { trees: TreeSummary[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (t: TreeSummary) => {
    setError(null);
    setEditingId(t.id);
    setDraftName(t.name);
  };

  const saveRename = async (t: TreeSummary) => {
    const name = draftName.trim();
    if (!name || name === t.name) {
      setEditingId(null);
      return;
    }
    setBusyId(t.id);
    setError(null);
    try {
      const res = await fetch(`/api/trees/${t.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Rename failed");
      setEditingId(null);
      router.refresh();
    } catch {
      setError(`Failed to rename "${t.name}".`);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (t: TreeSummary) => {
    if (!confirm(`Delete "${t.name}"? This removes the tree and all its nodes. This cannot be undone.`)) {
      return;
    }
    setDeletingId(t.id);
    setError(null);
    try {
      const res = await fetch(`/api/trees/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      router.refresh();
    } catch {
      setError(`Failed to delete "${t.name}".`);
    } finally {
      setDeletingId(null);
    }
  };

  if (trees.length === 0) {
    return (
      <p style={{ color: "var(--muted)", fontSize: 14 }}>No trees yet. Create one above to get started.</p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error && <div style={{ color: "var(--bad)", fontSize: 13 }}>{error}</div>}
      {trees.map((t) => {
        const editing = editingId === t.id;
        const busy = busyId === t.id;
        return (
          <div
            key={t.id}
            className="card"
            style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
          >
            {editing ? (
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRename(t);
                  if (e.key === "Escape") setEditingId(null);
                }}
                style={{ flex: 1, minWidth: 0 }}
              />
            ) : (
              <Link href={`/editor/${t.id}`} style={{ textDecoration: "none", flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "var(--text)" }}>{t.name}</div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  {t.businessUnit} · {t.nodeCount} nodes
                </div>
              </Link>
            )}

            {!editing && <span className="badge">{t.type}</span>}

            {editing ? (
              <>
                <button className="primary" onClick={() => saveRename(t)} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditingId(null)} disabled={busy}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={() => startEdit(t)} title="Rename tree">
                  Rename
                </button>
                <button className="danger" onClick={() => remove(t)} disabled={deletingId === t.id} title="Delete tree">
                  {deletingId === t.id ? "Deleting…" : "Delete"}
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
