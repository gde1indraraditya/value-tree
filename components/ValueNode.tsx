"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { TreeOrientation, ValueNode as VNode } from "@/lib/types";

export interface ValueNodeData {
  node: VNode;
  computed: number | null;
  issues: string[];
  /** Layout orientation — drives handle sides and operand-order direction text. */
  orientation: TreeOrientation;
  /** Operand position (0-based) when the PARENT is order-sensitive (SUBTRACT/DIVIDE); else null. */
  operandIndex: number | null;
  onValueChange: (id: string, value: number | null) => void;
  onAddChild: (id: string) => void;
  onDelete: (id: string) => void;
  [key: string]: unknown;
}

function format(value: number | null, unit: string): string {
  if (value === null) return "—";
  if (unit === "%") return (value * 100).toFixed(1) + "%";
  if (unit === "x") return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  // Up to 2 decimals: integers (e.g. money) stay clean, scores show precision
  // (e.g. 4.6 / 3.82) and match the header value exactly.
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function ValueNodeView({ data, selected }: NodeProps) {
  const d = data as unknown as ValueNodeData;
  const { node, computed, issues } = d;
  const isInput = node.kind === "input";
  const displayValue = isInput ? node.manualValue : computed;

  // Horizontal (RL): parent is to the right, so edges enter from the right and
  // leave to the left. Vertical (TB): top/bottom. Operand order text follows suit.
  const horizontal = d.orientation === "horizontal";
  const targetPos = horizontal ? Position.Right : Position.Top;
  const sourcePos = horizontal ? Position.Left : Position.Bottom;
  const operandTitle = horizontal ? "Operand order (top → bottom)" : "Operand order (left → right)";

  // Colour the value if it breaches its target.
  let tone = "";
  if (node.target !== null && displayValue !== null && node.target !== 0) {
    const dev = Math.abs((displayValue - node.target) / node.target);
    if (dev >= 0.2) tone = "bad";
    else if (dev >= 0.05) tone = "warn";
  }

  return (
    <div className={`vnode ${node.kind} ${selected ? "selected" : ""}`}>
      {node.parentId && <Handle type="target" position={targetPos} />}
      <div className="label">
        <span>
          {d.operandIndex !== null && (
            <span className="op-badge" title={operandTitle}>#{d.operandIndex + 1}</span>
          )}{" "}
          {node.label}
        </span>
        {!isInput && <span className="op-badge">{node.operator}</span>}
      </div>

      <div className={`value ${tone}`}>{format(displayValue, node.unit)}</div>

      {node.target !== null && (
        <div className="sub">target {format(node.target, node.unit)}</div>
      )}

      {isInput && (
        <input
          className="node-input"
          type="number"
          step="any"
          value={node.manualValue ?? ""}
          onChange={(e) =>
            d.onValueChange(node.id, e.target.value === "" ? null : Number(e.target.value))
          }
        />
      )}

      {issues.length > 0 && <div className="issue">⚠ {issues[0]}</div>}

      <div className="row">
        <button onClick={() => d.onAddChild(node.id)}>+ child</button>
        {node.parentId && (
          <button className="danger" onClick={() => d.onDelete(node.id)}>
            delete
          </button>
        )}
      </div>

      <Handle type="source" position={sourcePos} />
    </div>
  );
}
