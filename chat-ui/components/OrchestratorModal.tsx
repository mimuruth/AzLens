"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Orchestration } from "@/lib/orchestrator";

/**
 * Runs the multi-agent orchestrator: type an objective, a planner decomposes it
 * into agent-assigned sub-tasks, each specialist runs with its own MCP tools,
 * and a synthesizer merges the results into one answer. Calls /api/orchestrate.
 */
export default function OrchestratorModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [objective, setObjective] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Orchestration | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async () => {
    const obj = objective.trim();
    if (!obj || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: obj }),
      });
      const json = await res.json();
      if (!res.ok || json.error)
        throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json as Orchestration);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="orchestrator-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Orchestrator"
      >
        <div className="projects-modal-head">
          <span className="projects-modal-title">Multi-agent orchestrator</span>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close orchestrator"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="orchestrator-input">
          <textarea
            ref={inputRef}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
            }}
            rows={3}
            placeholder="Describe an objective — the planner splits it across specialist agents (⌘/Ctrl+Enter to run)…"
          />
          <button
            type="button"
            className="btn-primary"
            onClick={run}
            disabled={busy || objective.trim().length === 0}
          >
            {busy ? "Orchestrating…" : "Run"}
          </button>
        </div>

        {error && <p className="orchestrator-error">{error}</p>}

        {result && (
          <div className="orchestrator-result">
            <div className="orchestrator-plan">
              <span className="orchestrator-label">Plan</span>
              {result.results.map((r, i) => (
                <div key={i} className="orchestrator-step">
                  <button
                    type="button"
                    className="orchestrator-step-head"
                    onClick={() => toggle(i)}
                  >
                    <span className="orchestrator-caret">
                      {open.has(i) ? "▾" : "▸"}
                    </span>
                    <span className="orchestrator-agent">{r.agentName}</span>
                    <span className="orchestrator-task">{r.task}</span>
                    {r.error && (
                      <span className="orchestrator-badge">error</span>
                    )}
                  </button>
                  {open.has(i) && (
                    <div className="orchestrator-step-body markdown">
                      {r.error ? (
                        <p className="orchestrator-error">{r.error}</p>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {r.output}
                        </ReactMarkdown>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="orchestrator-answer">
              <span className="orchestrator-label">Synthesis</span>
              <div className="markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {result.answer}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
