"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  loadMessages,
  type ModelProvider,
  type ModelSelection,
} from "@/lib/storage";
import { AGENTS } from "@/lib/agents";
import { isSensitiveTool } from "@/lib/tools";
import Logo from "@/components/Logo";

type RouteAnnotation = {
  agentName?: string;
  provider?: string;
  model?: string;
  routed?: boolean;
  tier?: string;
  usage?: {
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
  };
  costUsd?: number;
};

export default function ChatArea({
  id,
  providers,
  modelSelection,
  onSelectModel,
  agentId,
  onSelectAgent,
  requireApproval,
  onToggleApproval,
  prefill,
  onMessages,
  onToggleSidebar,
}: {
  id: string;
  providers: ModelProvider[];
  modelSelection: ModelSelection | null;
  onSelectModel: (sel: ModelSelection) => void;
  agentId: string;
  onSelectAgent: (id: string) => void;
  requireApproval: boolean;
  onToggleApproval: () => void;
  prefill: { text: string; nonce: number } | null;
  onMessages: (id: string, messages: UIMessage[]) => void;
  onToggleSidebar: () => void;
}) {
  // Refs keep the latest selection available to prepareRequestBody, which the
  // SDK also calls for automatic tool-continuation requests.
  const agentIdRef = useRef(agentId);
  agentIdRef.current = agentId;
  const modelRef = useRef(modelSelection);
  modelRef.current = modelSelection;
  const approvalRef = useRef(requireApproval);
  approvalRef.current = requireApproval;

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    setInput,
    setMessages,
    stop,
    reload,
    append,
    addToolResult,
  } = useChat({
    id,
    initialMessages: loadMessages(id),
    // Auto-continue after a tool result is added (e.g. after an approval).
    maxSteps: 5,
    experimental_prepareRequestBody: ({ messages }) => ({
      messages,
      agentId: agentIdRef.current,
      requireApproval: approvalRef.current,
      ...(modelRef.current
        ? { provider: modelRef.current.provider, model: modelRef.current.model }
        : {}),
    }),
  });

  const isBusy = status === "submitted" || status === "streaming";
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const canSend = input.trim().length > 0 || attachments.length > 0;

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, [input]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Persist messages and let the shell update the conversation title/order.
  useEffect(() => {
    onMessages(id, messages);
  }, [messages, id, onMessages]);

  // Draft an example prompt into the composer when a tool is clicked.
  useEffect(() => {
    if (prefill && prefill.text) {
      setInput(prefill.text);
      textareaRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend && !isBusy) formRef.current?.requestSubmit();
    }
  }

  function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (list && list.length) {
      setAttachments((prev) => [...prev, ...Array.from(list)]);
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isBusy || !canSend) return;

    const options: { experimental_attachments?: FileList } = {};
    if (attachments.length > 0) {
      const dt = new DataTransfer();
      attachments.forEach((file) => dt.items.add(file));
      options.experimental_attachments = dt.files;
    }

    handleSubmit(e, options);
    setAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function textOf(message: UIMessage): string {
    const fromParts = (message.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n")
      .trim();
    return fromParts || (message as { content?: string }).content || "";
  }

  // Rough token estimate (~chars ÷ 4) for the turn ending at `message`, used
  // only when the provider doesn't report real usage.
  function approxTokens(message: UIMessage): number {
    const idx = messages.findIndex((m) => m.id === message.id);
    const upto = idx < 0 ? [message] : messages.slice(0, idx + 1);
    const chars = upto.reduce((sum, m) => sum + textOf(m).length, 0);
    return Math.max(1, Math.round(chars / 4));
  }

  function startEdit(message: UIMessage) {
    setEditingId(message.id);
    setEditText(textOf(message));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  function saveEdit(message: UIMessage) {
    const idx = messages.findIndex((m) => m.id === message.id);
    if (idx < 0) return;
    const text = editText.trim();
    setEditingId(null);
    setEditText("");
    if (!text) return;
    // Drop the edited message and everything after it, then resend.
    setMessages(messages.slice(0, idx));
    append({ role: "user", content: text });
  }

  async function copyMessage(message: UIMessage) {
    try {
      await navigator.clipboard.writeText(textOf(message));
    } catch {
      /* clipboard may be unavailable — ignore */
    }
  }

  async function approveTool(
    toolCallId: string,
    toolName: string,
    args: unknown
  ) {
    try {
      const res = await fetch("/api/tool", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: toolName, args }),
      });
      const json = await res.json();
      addToolResult({
        toolCallId,
        result: json.result ?? { error: json.error ?? "Tool call failed." },
      });
    } catch (err) {
      addToolResult({
        toolCallId,
        result: { error: (err as Error).message },
      });
    }
  }

  function denyTool(toolCallId: string) {
    addToolResult({
      toolCallId,
      result: "The user denied this tool call.",
    });
  }

  const isEmpty = messages.length === 0;

  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.id;

  function routeInfo(annotations: unknown): RouteAnnotation | null {
    if (!Array.isArray(annotations) || annotations.length === 0) return null;
    // The route badge is written first; usage/cost is appended on finish.
    const merged = Object.assign(
      {},
      ...(annotations as RouteAnnotation[])
    ) as RouteAnnotation;
    if (!merged || (!merged.model && !merged.agentName)) return null;
    return merged;
  }

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="icon-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect
              x="3"
              y="4"
              width="18"
              height="16"
              rx="2.5"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path d="M9 4v16" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
        <span className="topbar-title">AzLens</span>
        <button
          type="button"
          className={`approval-toggle ${requireApproval ? "on" : "off"}`}
          onClick={onToggleApproval}
          aria-pressed={requireApproval}
          title={
            requireApproval
              ? "Tool approval is ON — mutating tools ask before running"
              : "Tool approval is OFF — tools run automatically"
          }
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {requireApproval && (
              <path
                d="M9 12l2 2 4-4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
          {requireApproval ? "Approvals" : "Auto-run"}
        </button>
        <select
          className="agent-picker"
          value={agentId}
          onChange={(e) => onSelectAgent(e.target.value)}
          title="Agent"
        >
          {AGENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.glyph} {a.name}
            </option>
          ))}
        </select>
        {providers.length > 0 && modelSelection && (
          <select
            className="model-picker"
            value={`${modelSelection.provider}::${modelSelection.model}`}
            onChange={(e) => {
              const [provider, model] = e.target.value.split("::");
              onSelectModel({ provider, model });
            }}
            title="Model"
          >
            {providers.map((p) =>
              p.models.map((m) => (
                <option key={`${p.id}::${m}`} value={`${p.id}::${m}`}>
                  {p.label} · {m}
                </option>
              ))
            )}
          </select>
        )}
      </header>

      <main className={`conversation ${isEmpty ? "is-empty" : ""}`}>
        {isEmpty ? (
          <div className="greeting">
            <Logo size={44} className="greeting-logo" />
            <h1>How can I help you today?</h1>
            <p className="hint">
              Ask me to read a file, query an Azure resource, or update your
              to-do list.
            </p>
          </div>
        ) : (
          <div className="thread">
            {messages.map((message) => (
              <div key={message.id} className={`msg ${message.role}`}>
                {message.role === "assistant" && (
                  <Logo size={28} className="avatar-logo" />
                )}
                <div className="content">
                  {message.role === "assistant" &&
                    (() => {
                      const info = routeInfo(message.annotations);
                      if (!info) return null;
                      return (
                        <div className="route-badge">
                          {info.agentName && (
                            <span className="rb-agent">{info.agentName}</span>
                          )}
                          {info.model && (
                            <span className="rb-model">{info.model}</span>
                          )}
                          {info.routed && info.tier && (
                            <span className={`rb-tier ${info.tier}`}>
                              {info.tier}
                            </span>
                          )}
                          {(() => {
                            const u = info.usage;
                            const total =
                              u?.totalTokens ??
                              (u
                                ? (u.promptTokens ?? 0) +
                                  (u.completionTokens ?? 0)
                                : 0);
                            if (total > 0) {
                              return (
                                <span className="rb-usage">
                                  {total.toLocaleString()} tokens
                                </span>
                              );
                            }
                            // Provider didn't report usage — show an estimate.
                            return (
                              <span
                                className="rb-usage rb-approx"
                                title="Estimated (characters ÷ 4)"
                              >
                                ~{approxTokens(message).toLocaleString()} tokens
                              </span>
                            );
                          })()}
                          {info.costUsd != null && (
                            <span className="rb-cost">
                              ${info.costUsd.toFixed(4)}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  {editingId === message.id ? (
                    <div className="edit-box">
                      <textarea
                        className="edit-input"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        autoFocus
                      />
                      <div className="edit-actions">
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => saveEdit(message)}
                        >
                          Save &amp; submit
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {message.experimental_attachments?.map((att, i) =>
                        att.contentType?.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={`att-${i}`}
                            className="att-img"
                            src={att.url}
                            alt={att.name ?? "attachment"}
                          />
                        ) : (
                          <div key={`att-${i}`} className="att-file">
                            <span className="clip">📎</span>
                            {att.name ?? "file"}
                          </div>
                        )
                      )}
                      {message.parts.map((part, i) => {
                        if (part.type === "text") {
                          return message.role === "assistant" ? (
                            <div key={i} className="markdown">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {part.text}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <p key={i}>{part.text}</p>
                          );
                        }
                        if (part.type === "tool-invocation") {
                          const inv = part.toolInvocation;
                          const awaiting =
                            inv.state === "call" &&
                            isSensitiveTool(inv.toolName);
                          return (
                            <div key={i} className="tool">
                              <span className="tool-dot" />
                              {inv.state === "result"
                                ? "used"
                                : awaiting
                                  ? "wants to use"
                                  : "using"}{" "}
                              <code>{inv.toolName}</code>
                              {awaiting && (
                                <span className="tool-approve">
                                  <button
                                    type="button"
                                    className="btn-approve"
                                    onClick={() =>
                                      approveTool(
                                        inv.toolCallId,
                                        inv.toolName,
                                        inv.args
                                      )
                                    }
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-deny"
                                    onClick={() => denyTool(inv.toolCallId)}
                                  >
                                    Deny
                                  </button>
                                </span>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })}
                      <div className="msg-actions">
                        {message.role === "assistant" && (
                          <button
                            type="button"
                            className="msg-action"
                            onClick={() => copyMessage(message)}
                            title="Copy message"
                          >
                            Copy
                          </button>
                        )}
                        {message.role === "assistant" &&
                          message.id === lastAssistantId &&
                          !isBusy && (
                            <button
                              type="button"
                              className="msg-action"
                              onClick={() => reload()}
                              title="Regenerate response"
                            >
                              Regenerate
                            </button>
                          )}
                        {message.role === "user" && !isBusy && (
                          <button
                            type="button"
                            className="msg-action"
                            onClick={() => startEdit(message)}
                            title="Edit & resend"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
            {isBusy && (
              <div className="msg assistant">
                <Logo size={28} className="avatar-logo" />
                <div className="content">
                  <span className="typing">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      <div className="composer-wrap">
        <form ref={formRef} className="composer" onSubmit={onSubmit}>
          {attachments.length > 0 && (
            <div className="attachments">
              {attachments.map((file, i) => {
                const isImg = file.type.startsWith("image/");
                return (
                  <div key={i} className="att-chip">
                    {isImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={URL.createObjectURL(file)} alt={file.name} />
                    ) : (
                      <span className="clip">📎</span>
                    )}
                    <span className="att-name">{file.name}</span>
                    <button
                      type="button"
                      className="att-remove"
                      aria-label="Remove attachment"
                      onClick={() => removeAttachment(i)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="composer-row">
            <button
              type="button"
              className="attach"
              aria-label="Add attachment"
              title="Attach files or images"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <textarea
              ref={textareaRef}
              className="input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={onKeyDown}
              placeholder="Message AzLens…"
              rows={1}
              autoFocus
            />
            {isBusy ? (
              <button
                className="send stop"
                type="button"
                onClick={() => stop()}
                aria-label="Stop generating"
                title="Stop generating"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="6"
                    y="6"
                    width="12"
                    height="12"
                    rx="2"
                    fill="currentColor"
                  />
                </svg>
              </button>
            ) : (
              <button
                className="send"
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 19V5M12 5l-6 6M12 5l6 6"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={onFilesSelected}
            accept="image/*,.pdf,.txt,.md,.json,.csv,.log"
          />
        </form>
        <p className="disclaimer">
          AzLens can use MCP tools to act on your behalf.
        </p>
      </div>
    </div>
  );
}
