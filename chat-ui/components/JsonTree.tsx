"use client";

import { useState } from "react";

/**
 * A tiny collapsible JSON tree used by the Artifacts panel to preview `json`
 * blocks. Renders objects/arrays as expandable nodes and scalars inline.
 */
export default function JsonTree({ text }: { text: string }) {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return <div className="json-tree-error">Not valid JSON.</div>;
  }
  return (
    <div className="json-tree">
      <Node value={value} name={null} depth={0} defaultOpen />
    </div>
  );
}

function Node({
  value,
  name,
  depth,
  defaultOpen = false,
}: {
  value: unknown;
  name: string | null;
  depth: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || depth < 1);
  const key = name !== null ? <span className="json-key">{name}: </span> : null;

  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>);
    const open2 = Array.isArray(value) ? "[" : "{";
    const close = Array.isArray(value) ? "]" : "}";
    if (entries.length === 0) {
      return (
        <div className="json-row" style={{ paddingLeft: depth * 12 }}>
          {key}
          <span className="json-punc">
            {open2}
            {close}
          </span>
        </div>
      );
    }
    return (
      <div className="json-node">
        <div
          className="json-row json-toggle"
          style={{ paddingLeft: depth * 12 }}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="json-caret">{open ? "▾" : "▸"}</span>
          {key}
          <span className="json-punc">{open2}</span>
          {!open && (
            <span className="json-collapsed">
              {entries.length} {entries.length === 1 ? "item" : "items"}
              {close}
            </span>
          )}
        </div>
        {open && (
          <>
            {entries.map(([k, v]) => (
              <Node key={k} name={k} value={v} depth={depth + 1} />
            ))}
            <div
              className="json-row json-punc"
              style={{ paddingLeft: depth * 12 }}
            >
              {close}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="json-row" style={{ paddingLeft: depth * 12 }}>
      {key}
      <span className={`json-val json-${typeof value}`}>
        {typeof value === "string" ? `"${value}"` : String(value)}
      </span>
    </div>
  );
}
