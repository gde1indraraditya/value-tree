"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import ValueNodeView, { ValueNodeData } from "./ValueNode";
import InsightPanel from "./InsightPanel";
import { evaluate } from "@/lib/calc";
import { autoLayout } from "@/lib/layout";
import { Insight } from "@/lib/insight";
import { NodeKind, Operator, ValueNode, ValueTree } from "@/lib/types";

const nodeTypes = { valueNode: ValueNodeView };

const FINANCIAL_OPS: Operator[] = ["SUM", "SUBTRACT", "MULTIPLY", "DIVIDE"];
const QUALITATIVE_OPS: Operator[] = ["WEIGHTED", "SUM"];

type SaveState = "idle" | "saving" | "saved" | "error";

/** Trees freshly loaded with all-zero positions need an initial auto-layout. */
function needsLayout(t: ValueTree): boolean {
  return Object.values(t.nodes).every((n) => n.position.x === 0 && n.position.y === 0);
}

export default function ValueTreeEditor({ initialTree }: { initialTree: ValueTree }) {
  const [tree, setTree] = useState<ValueTree>(() =>
    needsLayout(initialTree) ? autoLayout(initialTree) : initialTree,
  );
  const [selectedId, setSelectedId] = useState<string | null>(initialTree.rootId);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Autosave to PostgreSQL (debounced). Skip the very first render (initial load).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState("saving");
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/trees/${tree.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(tree),
        });
        setSaveState(res.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    }, 800);
    return () => clearTimeout(handle);
  }, [tree]);

  const ev = useMemo(() => evaluate(tree), [tree]);
  const defaultCalcOp = tree.type === "qualitative" ? "WEIGHTED" : "SUM";
  const allowedOps = tree.type === "qualitative" ? QUALITATIVE_OPS : FINANCIAL_OPS;

  // ---- node mutations (functional updates → no stale closures) -------------
  const onValueChange = useCallback((id: string, value: number | null) => {
    setTree((t) => ({ ...t, nodes: { ...t.nodes, [id]: { ...t.nodes[id], manualValue: value } } }));
  }, []);

  const onAddChild = useCallback(
    (parentId: string) => {
      setTree((t) => {
        const id = crypto.randomUUID();
        const siblings = Object.values(t.nodes).filter((n) => n.parentId === parentId);
        const parent = t.nodes[parentId];
        const child: ValueNode = {
          id,
          parentId,
          order: siblings.length,
          label: "New driver",
          unit: parent.unit,
          kind: "input",
          operator: "NONE",
          manualValue: 0,
          weight: t.type === "qualitative" ? Number((1 / (siblings.length + 1)).toFixed(2)) : 1,
          target: null,
          position: { x: parent.position.x, y: parent.position.y + 140 },
        };
        // Adding a child turns an input node into a calculated one.
        const newParent: ValueNode =
          parent.kind === "input"
            ? { ...parent, kind: "calculated", operator: defaultCalcOp, manualValue: null }
            : parent;
        const nodes = { ...t.nodes, [parentId]: newParent, [id]: child };
        return autoLayout({ ...t, nodes });
      });
      setSelectedId(parentId);
    },
    [defaultCalcOp],
  );

  const onDelete = useCallback((id: string) => {
    setTree((t) => {
      if (id === t.rootId) return t;
      // Collect the whole subtree.
      const toRemove = new Set<string>();
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop()!;
        toRemove.add(cur);
        for (const n of Object.values(t.nodes)) if (n.parentId === cur) stack.push(n.id);
      }
      const parentId = t.nodes[id].parentId;
      const nodes: Record<string, ValueNode> = {};
      for (const n of Object.values(t.nodes)) if (!toRemove.has(n.id)) nodes[n.id] = n;
      // If the parent lost all children, turn it back into an input.
      if (parentId && !Object.values(nodes).some((n) => n.parentId === parentId)) {
        nodes[parentId] = { ...nodes[parentId], kind: "input", operator: "NONE", manualValue: 0 };
      }
      return autoLayout({ ...t, nodes });
    });
    setSelectedId(null);
  }, []);

  const patchNode = useCallback((id: string, patch: Partial<ValueNode>) => {
    setTree((t) => ({ ...t, nodes: { ...t.nodes, [id]: { ...t.nodes[id], ...patch } } }));
  }, []);

  // ---- React Flow node/edge derivation -------------------------------------
  const rfNodes: Node[] = useMemo(
    () =>
      Object.values(tree.nodes).map((nd) => ({
        id: nd.id,
        type: "valueNode",
        position: nd.position,
        selected: nd.id === selectedId,
        data: {
          node: nd,
          computed: ev.values[nd.id] ?? null,
          issues: ev.issues[nd.id] ?? [],
          onValueChange,
          onAddChild,
          onDelete,
        } satisfies ValueNodeData,
      })),
    [tree, ev, selectedId, onValueChange, onAddChild, onDelete],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      Object.values(tree.nodes)
        .filter((n) => n.parentId)
        .map((n) => ({ id: `${n.parentId}-${n.id}`, source: n.parentId!, target: n.id })),
    [tree],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Persist ONLY drag positions back into the tree (single source of truth).
    // Ignoring dimension/select/etc. changes is critical: writing those back
    // re-creates nodes → React Flow re-measures → emits more changes → loop.
    const positionChanges = changes.filter(
      (c): c is Extract<NodeChange, { type: "position" }> => c.type === "position" && !!c.position,
    );
    if (positionChanges.length === 0) return;
    setTree((t) => {
      const nodes = { ...t.nodes };
      for (const c of positionChanges) {
        if (nodes[c.id] && c.position) nodes[c.id] = { ...nodes[c.id], position: c.position };
      }
      return { ...t, nodes };
    });
  }, []);

  const focusNode = useCallback(
    (nodeId: string) => {
      setSelectedId(nodeId);
      const pos = tree.nodes[nodeId]?.position;
      if (rf && pos) rf.setCenter(pos.x + 105, pos.y + 46, { zoom: 1.1, duration: 500 });
    },
    [rf, tree],
  );

  const generateInsight = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/insight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tree }),
      });
      setInsight(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const selected = selectedId ? tree.nodes[selectedId] : null;
  const rootVal = ev.values[tree.rootId];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", height: "100vh" }}>
      {/* ---- canvas ---- */}
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            zIndex: 5,
            top: 12,
            left: 12,
            right: 12,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <a href="/" style={{ textDecoration: "none" }}>← Trees</a>
          <strong>{tree.name}</strong>
          <span className="badge">{tree.type}</span>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            {tree.nodes[tree.rootId].label}: <b style={{ color: "var(--good)" }}>{rootVal === null ? "—" : rootVal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b>
          </span>
          <span style={{ fontSize: 12, color: saveState === "error" ? "var(--bad)" : "var(--muted)" }}>
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "✓ Saved"}
            {saveState === "error" && "⚠ Save failed"}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setTree((t) => autoLayout(t))}>Auto layout</button>
          <button className="primary" onClick={generateInsight} disabled={loading}>
            {loading ? "Analysing…" : "Generate AI Insight"}
          </button>
        </div>

        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onInit={setRf}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          fitView
          minZoom={0.2}
        >
          <Background color="#33425f" gap={18} size={1.5} />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>

      {/* ---- right rail: node editor (top) + insight (bottom) ---- */}
      <div style={{ borderLeft: "1px solid var(--border)", display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" }}>
        <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ margin: "0 0 8px" }}>Node editor</h3>
          {!selected && <p style={{ color: "var(--muted)", fontSize: 13 }}>Select a node to edit it.</p>}
          {selected && (
            <div style={{ display: "grid", gap: 8 }}>
              <Field label="Label">
                <input value={selected.label} onChange={(e) => patchNode(selected.id, { label: e.target.value })} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Field label="Unit">
                  <input value={selected.unit} onChange={(e) => patchNode(selected.id, { unit: e.target.value })} />
                </Field>
                <Field label="Type">
                  <select
                    value={selected.kind}
                    onChange={(e) => {
                      const kind = e.target.value as NodeKind;
                      patchNode(selected.id, {
                        kind,
                        operator: kind === "calculated" ? defaultCalcOp : "NONE",
                        manualValue: kind === "input" ? selected.manualValue ?? 0 : null,
                      });
                    }}
                  >
                    <option value="input">input</option>
                    <option value="calculated">calculated</option>
                  </select>
                </Field>
              </div>
              {selected.kind === "calculated" && (
                <Field label="Operator">
                  <select value={selected.operator} onChange={(e) => patchNode(selected.id, { operator: e.target.value as Operator })}>
                    {allowedOps.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </Field>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Field label="Target (optional)">
                  <input
                    type="number"
                    step="any"
                    value={selected.target ?? ""}
                    onChange={(e) => patchNode(selected.id, { target: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </Field>
                {selected.parentId && tree.nodes[selected.parentId]?.operator === "WEIGHTED" && (
                  <Field label="Weight (0–1)">
                    <input
                      type="number"
                      step="0.05"
                      value={selected.weight}
                      onChange={(e) => patchNode(selected.id, { weight: Number(e.target.value) })}
                    />
                  </Field>
                )}
              </div>
            </div>
          )}
        </div>
        <InsightPanel insight={insight} loading={loading} onFocus={focusNode} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 3, fontSize: 12, color: "var(--muted)" }}>
      {label}
      {children}
    </label>
  );
}
