"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TreeType } from "@/lib/types";

export default function NewTreeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [businessUnit, setBusinessUnit] = useState("");
  const [type, setType] = useState<TreeType>("financial");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, businessUnit, type }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to create tree");
      }
      const tree = await res.json();
      router.push(`/editor/${tree.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tree");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card" style={{ padding: 16, marginTop: 24 }}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>+ New tree</div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.2fr auto", gap: 10, alignItems: "end" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 Revenue Tree" />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
          Business unit
          <input value={businessUnit} onChange={(e) => setBusinessUnit(e.target.value)} placeholder="e.g. Sales" />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as TreeType)}>
            <option value="financial">financial</option>
            <option value="qualitative">qualitative</option>
          </select>
        </label>
        <button className="primary" type="submit" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
      {error && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>{error}</div>}
    </form>
  );
}
