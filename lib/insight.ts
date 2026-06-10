import { childrenOf, contributionShares, evaluate } from "./calc";
import { EvalResult, ValueTree } from "./types";

export interface Anomaly {
  nodeId: string;
  label: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

export interface Recommendation {
  nodeId: string;
  label: string;
  action: string;
}

export interface Insight {
  generatedBy: "claude" | "heuristic";
  summary: string;
  anomalies: Anomaly[];
  recommendations: Recommendation[];
}

const ANOMALY_THRESHOLD = 0.05; // 5% deviation from target is "worth a look".

/** Deterministic anomaly + recommendation pass. Always available, no network. */
export function heuristicInsight(tree: ValueTree, ev: EvalResult): Insight {
  const anomalies: Anomaly[] = [];
  const recommendations: Recommendation[] = [];

  // 1) Target deviations.
  for (const node of Object.values(tree.nodes)) {
    const value = ev.values[node.id];
    if (node.target === null || value === null) continue;
    const dev = node.target === 0 ? 0 : (value - node.target) / Math.abs(node.target);
    if (Math.abs(dev) < ANOMALY_THRESHOLD) continue;
    const pct = Math.round(dev * 100);
    const severity = Math.abs(dev) >= 0.2 ? "high" : Math.abs(dev) >= 0.1 ? "medium" : "low";
    anomalies.push({
      nodeId: node.id,
      label: node.label,
      severity,
      detail: `${node.label} is ${value.toLocaleString()} vs target ${node.target.toLocaleString()} (${pct > 0 ? "+" : ""}${pct}%).`,
    });
  }

  // 2) Structural issues surfaced by the engine (weights, divide-by-zero, missing).
  for (const [nodeId, msgs] of Object.entries(ev.issues)) {
    const node = tree.nodes[nodeId];
    if (!node) continue;
    for (const m of msgs) {
      anomalies.push({ nodeId, label: node.label, severity: "medium", detail: m });
    }
  }

  // 3) Recommendations: trace the dominant driver from the root downward.
  const path = dominantPath(tree, ev.values);
  const anomalyIds = new Set(anomalies.map((a) => a.nodeId));
  for (const step of path) {
    if (anomalyIds.has(step.id)) {
      recommendations.push({
        nodeId: step.id,
        label: step.label,
        action: `"${step.label}" carries ~${Math.round(step.share * 100)}% of its parent's value and is off-target. Prioritise corrective action here for the biggest impact on the root metric.`,
      });
    }
  }
  if (recommendations.length === 0 && path.length > 0) {
    const top = path[path.length - 1];
    recommendations.push({
      nodeId: top.id,
      label: top.label,
      action: `No target breaches detected. The largest lever on the root metric is "${top.label}" (~${Math.round(top.share * 100)}% of its parent). Set a target on it to enable monitoring.`,
    });
  }

  const rootVal = ev.values[tree.rootId];
  const summary = `Root metric "${tree.nodes[tree.rootId]?.label}" = ${rootVal === null ? "n/a" : rootVal.toLocaleString()}. ` +
    `${anomalies.length} signal(s) detected, ${recommendations.length} recommendation(s).`;

  return { generatedBy: "heuristic", summary, anomalies, recommendations };
}

/** Walk root -> dominant child repeatedly to find the most influential leaf path. */
function dominantPath(tree: ValueTree, values: Record<string, number | null>) {
  const out: { id: string; label: string; share: number }[] = [];
  let current = tree.rootId;
  const guard = new Set<string>();
  while (current && !guard.has(current)) {
    guard.add(current);
    const shares = contributionShares(tree, current, values);
    if (shares.length === 0) break;
    const top = shares.sort((a, b) => b.share - a.share)[0];
    out.push({ id: top.id, label: top.label, share: top.share });
    current = top.id;
  }
  return out;
}

/**
 * Serialize a tree into a compact, LLM-friendly outline. This is what we hand to
 * Claude as context — structure + values + targets + operators, indented by depth.
 */
export function serializeTree(tree: ValueTree, ev: EvalResult): string {
  const lines: string[] = [];
  const walk = (id: string, depth: number) => {
    const node = tree.nodes[id];
    if (!node) return;
    const v = ev.values[id];
    const parts = [
      `${"  ".repeat(depth)}- ${node.label}`,
      `= ${v === null ? "n/a" : v.toLocaleString()}${node.unit && node.unit !== "x" ? " " + node.unit : ""}`,
    ];
    if (node.kind === "calculated") parts.push(`[${node.operator} of children]`);
    if (node.target !== null) parts.push(`(target ${node.target.toLocaleString()})`);
    lines.push(parts.join(" "));
    for (const c of childrenOf(tree, id)) walk(c.id, depth + 1);
  };
  walk(tree.rootId, 0);
  return lines.join("\n");
}

/**
 * Top-level entry: prefer Claude when an API key is configured, otherwise fall
 * back to the deterministic heuristic so the prototype always returns something.
 *
 * To enable real AI: set ANTHROPIC_API_KEY in .env.local. Model id is current as
 * of this build; check the claude-api reference before shipping to production.
 */
export async function generateInsight(tree: ValueTree): Promise<Insight> {
  const ev = evaluate(tree);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return heuristicInsight(tree, ev);

  try {
    const outline = serializeTree(tree, ev);
    const system =
      "You are a financial/strategy analyst reading a value driver tree. " +
      "Detect anomalies (off-target or imbalanced drivers) and give concrete, prioritised action recommendations. " +
      "Respond ONLY with JSON matching: {summary:string, anomalies:[{nodeId,label,severity,detail}], recommendations:[{nodeId,label,action}]}.";
    const user =
      `Tree type: ${tree.type}. Business unit: ${tree.businessUnit}.\n` +
      `Node ids and labels:\n${Object.values(tree.nodes).map((n) => `${n.id}: ${n.label}`).join("\n")}\n\n` +
      `Outline (value vs target):\n${outline}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const parsed = JSON.parse(text.replace(/^```json\n?|```$/g, "").trim());
    return { generatedBy: "claude", ...parsed };
  } catch (err) {
    // Never fail the request — degrade gracefully to the heuristic.
    const fallback = heuristicInsight(tree, ev);
    fallback.summary = `[Claude unavailable — heuristic used] ${fallback.summary}`;
    return fallback;
  }
}
