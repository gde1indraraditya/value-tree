"use client";

import { Insight } from "@/lib/insight";

export default function InsightPanel({
  insight,
  loading,
  onFocus,
}: {
  insight: Insight | null;
  loading: boolean;
  onFocus: (nodeId: string) => void;
}) {
  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <h3 style={{ margin: "0 0 4px" }}>AI Insight</h3>
      {loading && <p style={{ color: "var(--muted)" }}>Analysing tree…</p>}
      {!loading && !insight && (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Click <b>Generate AI Insight</b> to detect anomalies and get recommended actions.
        </p>
      )}

      {insight && (
        <>
          <p style={{ fontSize: 13 }}>
            <span className="badge">{insight.generatedBy === "claude" ? "Claude" : "Heuristic"}</span>{" "}
            {insight.summary}
          </p>

          <h4 style={{ margin: "14px 0 6px" }}>Anomalies ({insight.anomalies.length})</h4>
          {insight.anomalies.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>None detected.</p>
          )}
          {insight.anomalies.map((a, i) => (
            <div key={i} className="card" style={{ padding: 8, marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                <button
                  style={{ all: "unset", cursor: "pointer", fontWeight: 600, color: "var(--accent)" }}
                  onClick={() => onFocus(a.nodeId)}
                >
                  {a.label}
                </button>
                <span className={`badge ${a.severity}`}>{a.severity}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{a.detail}</div>
            </div>
          ))}

          <h4 style={{ margin: "14px 0 6px" }}>Recommendations ({insight.recommendations.length})</h4>
          {insight.recommendations.map((r, i) => (
            <div key={i} className="card" style={{ padding: 8, marginBottom: 6 }}>
              <button
                style={{ all: "unset", cursor: "pointer", fontWeight: 600, color: "var(--accent)" }}
                onClick={() => onFocus(r.nodeId)}
              >
                {r.label}
              </button>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{r.action}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
