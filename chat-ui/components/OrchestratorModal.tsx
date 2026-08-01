"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type StepStatus = "running" | "done" | "error";
type TokenUsage = {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
};
type StepState = {
  agentName: string;
  task: string;
  status: StepStatus;
  output?: string;
  error?: string;
  usage?: TokenUsage;
  cost?: number | null;
  startedAt?: number;
  endedAt?: number;
};

/**
 * Runs the multi-agent orchestrator with live progress: a planner decomposes an
 * objective into agent-assigned sub-tasks, independent ones fan out in parallel
 * (each with its own MCP tools), and a synthesizer merges the results. Consumes
 * the newline-delimited event stream from /api/orchestrate.
 */
export default function OrchestratorModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [objective, setObjective] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<number, StepState>>({});
  const [answer, setAnswer] = useState("");
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

  const handleEvent = (e: {
    type: string;
    index?: number;
    agentName?: string;
    task?: string;
    at?: number;
    result?: {
      agentName: string;
      task: string;
      output: string;
      error?: string;
      usage?: TokenUsage;
      cost?: number | null;
      startedAt?: number;
      endedAt?: number;
    };
    answer?: string;
    error?: string;
  }) => {
    switch (e.type) {
      case "step-start":
        setSteps((prev) => ({
          ...prev,
          [e.index!]: {
            agentName: e.agentName!,
            task: e.task!,
            status: "running",
            startedAt: e.at,
          },
        }));
        break;
      case "step-done":
        setSteps((prev) => ({
          ...prev,
          [e.index!]: {
            agentName: e.result!.agentName,
            task: e.result!.task,
            status: e.result!.error ? "error" : "done",
            output: e.result!.output,
            error: e.result!.error,
            usage: e.result!.usage,
            cost: e.result!.cost,
            startedAt: e.result!.startedAt,
            endedAt: e.result!.endedAt,
          },
        }));
        break;
      case "answer":
        setAnswer(e.answer ?? "");
        break;
      case "error":
        setError(e.error ?? "Orchestration failed.");
        break;
    }
  };

  const run = async () => {
    const obj = objective.trim();
    if (!obj || busy) return;
    setBusy(true);
    setError(null);
    setSteps({});
    setAnswer("");
    setOpen(new Set());
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: obj }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handleEvent(JSON.parse(line));
        }
      }
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

  const indices = Object.keys(steps)
    .map(Number)
    .sort((a, b) => a - b);

  const stepTokens = (s: StepState): number | null => {
    const u = s.usage;
    if (!u) return null;
    const t =
      u.totalTokens ??
      Number(u.promptTokens ?? 0) + Number(u.completionTokens ?? 0);
    return t || null;
  };
  const fmtCost = (c?: number | null): string | null =>
    typeof c === "number" ? `$${c < 0.01 ? c.toFixed(4) : c.toFixed(3)}` : null;

  const totals = indices.reduce(
    (acc, i) => {
      acc.tokens += stepTokens(steps[i]) ?? 0;
      if (typeof steps[i].cost === "number")
        acc.cost += steps[i].cost as number;
      return acc;
    },
    { tokens: 0, cost: 0 }
  );
  const timelineEnd = Math.max(
    1,
    ...indices.map((i) => steps[i].endedAt ?? steps[i].startedAt ?? 0)
  );

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

        {(indices.length > 0 || answer) && (
          <div className="orchestrator-result">
            {indices.length > 0 && (
              <div className="orchestrator-plan">
                <span className="orchestrator-label">
                  Plan{busy ? " (running…)" : ""}
                </span>
                {indices.map((i) => {
                  const s = steps[i];
                  return (
                    <div key={i} className="orchestrator-step">
                      <button
                        type="button"
                        className="orchestrator-step-head"
                        onClick={() => toggle(i)}
                      >
                        <span className={`orchestrator-status ${s.status}`}>
                          {s.status === "running"
                            ? "◐"
                            : s.status === "error"
                              ? "✗"
                              : "✓"}
                        </span>
                        <span className="orchestrator-agent">
                          {s.agentName}
                        </span>
                        <span className="orchestrator-task">{s.task}</span>
                        {stepTokens(s) != null && (
                          <span className="orchestrator-meta">
                            {stepTokens(s)!.toLocaleString()} tok
                            {fmtCost(s.cost) ? ` · ${fmtCost(s.cost)}` : ""}
                          </span>
                        )}
                      </button>
                      {open.has(i) && (s.output || s.error) && (
                        <div className="orchestrator-step-body markdown">
                          {s.error ? (
                            <p className="orchestrator-error">{s.error}</p>
                          ) : (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {s.output ?? ""}
                            </ReactMarkdown>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {indices.some((i) => steps[i].startedAt != null) && (
              <div className="orchestrator-timeline">
                <span className="orchestrator-label">
                  Timeline
                  {totals.tokens
                    ? ` · ${totals.tokens.toLocaleString()} tokens${
                        fmtCost(totals.cost) ? ` · ${fmtCost(totals.cost)}` : ""
                      }`
                    : ""}
                </span>
                {indices.map((i) => {
                  const s = steps[i];
                  const start = s.startedAt ?? 0;
                  const end = s.endedAt ?? timelineEnd;
                  const left = (start / timelineEnd) * 100;
                  const width = Math.max(
                    2,
                    ((end - start) / timelineEnd) * 100
                  );
                  return (
                    <div key={i} className="orchestrator-tl-row">
                      <span className="orchestrator-tl-name">
                        {s.agentName}
                      </span>
                      <span className="orchestrator-tl-track">
                        <span
                          className={`orchestrator-tl-bar ${s.status}`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`${Math.round(end - start)} ms`}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {answer && (
              <div className="orchestrator-answer">
                <span className="orchestrator-label">Synthesis</span>
                <div className="markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {answer}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
