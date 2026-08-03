"use client";

import { useChat } from "@ai-sdk/react";
import {
  useEffect,
  useRef,
  useState,
  isValidElement,
  type ReactNode,
} from "react";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  loadMessages,
  loadFeedback,
  saveFeedbackLocal,
  type Feedback,
  type Rating,
  type ModelProvider,
  type ModelSelection,
  type PromptTemplate,
} from "@/lib/storage";
import { AGENTS } from "@/lib/agents";
import { isSensitiveTool } from "@/lib/tools";
import { budgetStatus, formatUsd, SESSION_BUDGET_USD } from "@/lib/budget";
import {
  sttSupported,
  ttsSupported,
  createRecognition,
  stripMarkdownForSpeech,
} from "@/lib/voice";
import { extractSources } from "@/lib/sources";
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

type Inv = {
  toolName: string;
  toolCallId: string;
  state: string;
  args?: Record<string, unknown>;
  result?: unknown;
};

function extractResult(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  const r = result as { content?: { type?: string; text?: string }[] };
  if (Array.isArray(r.content)) {
    return r.content
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();
  }
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

/** A collapsible tool-call card showing the tool name, arguments, and result. */
function ToolCard({
  inv,
  awaiting,
  onApprove,
  onDeny,
}: {
  inv: Inv;
  awaiting: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label =
    inv.state === "result" ? "used" : awaiting ? "wants to use" : "using";
  const resultText = inv.state === "result" ? extractResult(inv.result) : "";
  const hasArgs = inv.args && Object.keys(inv.args).length > 0;
  const hasDetails = hasArgs || resultText.length > 0;

  return (
    <div className={`tool-card ${awaiting ? "awaiting" : ""}`}>
      <button
        type="button"
        className="tool-card-head"
        onClick={() => hasDetails && setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`tool-dot ${inv.state === "result" ? "" : "live"}`} />
        <span className="tc-verb">{label}</span>
        <code>{inv.toolName}</code>
        {hasDetails && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            className={open ? "chev open" : "chev"}
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      {open && (
        <div className="tool-card-body">
          {hasArgs && (
            <>
              <div className="tc-label">Arguments</div>
              <pre className="tc-pre">{JSON.stringify(inv.args, null, 2)}</pre>
            </>
          )}
          {resultText && (
            <>
              <div className="tc-label">Result</div>
              <pre className="tc-pre">{resultText}</pre>
            </>
          )}
        </div>
      )}
      {awaiting && (
        <div className="tool-approve">
          <button type="button" className="btn-approve" onClick={onApprove}>
            Approve
          </button>
          <button type="button" className="btn-deny" onClick={onDeny}>
            Deny
          </button>
        </div>
      )}
    </div>
  );
}

/** A code block with a language label + copy button; highlighted by rehype. */
function CodeBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  let lang = "";
  if (isValidElement(children)) {
    const cls = (children.props as { className?: string })?.className ?? "";
    const m = /language-([\w-]+)/.exec(cls);
    if (m) lang = m[1];
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref.current?.innerText ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{lang || "code"}</span>
        <button type="button" className="code-copy" onClick={copy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

/** Assistant markdown with GitHub-flavoured tables and highlighted code. */
function MessageMarkdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={{ pre: (props) => <CodeBlock>{props.children}</CodeBlock> }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** Quick composer modes (Kimi-style). Each prepends a behaviour hint server-side. */
const COMPOSER_MODES: { id: string; label: string; glyph: string }[] = [
  { id: "swarm", label: "Swarm", glyph: "✦" },
  { id: "slide", label: "Slide", glyph: "▭" },
  { id: "deep-research", label: "Deep Research", glyph: "◈" },
  { id: "websites", label: "Websites", glyph: "◍" },
  { id: "docs", label: "Docs", glyph: "▤" },
  { id: "sheets", label: "Sheets", glyph: "▦" },
];

export default function ChatArea({
  id,
  providers,
  modelSelection,
  onSelectModel,
  agentId,
  onSelectAgent,
  requireApproval,
  onToggleApproval,
  instructions,
  onSetInstructions,
  projectInstructions,
  templates,
  onSaveTemplate,
  onBookmark,
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
  instructions: string;
  onSetInstructions: (text: string) => void;
  projectInstructions: string;
  templates: PromptTemplate[];
  onSaveTemplate: (title: string, text: string) => void;
  onBookmark: (message: UIMessage) => void;
  prefill: { text: string; nonce: number; mode?: string | null } | null;
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
  const instructionsRef = useRef(instructions);
  instructionsRef.current = instructions;
  const projectInstructionsRef = useRef(projectInstructions);
  projectInstructionsRef.current = projectInstructions;
  const modeRef = useRef<string | null>(null);

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
    error,
  } = useChat({
    id,
    initialMessages: loadMessages(id),
    // Auto-continue after a tool result is added (e.g. after an approval).
    maxSteps: 5,
    experimental_prepareRequestBody: ({ messages }) => {
      const mergedInstructions = [
        projectInstructionsRef.current,
        instructionsRef.current,
      ]
        .filter(Boolean)
        .join("\n\n");
      return {
        messages,
        agentId: agentIdRef.current,
        requireApproval: approvalRef.current,
        ...(mergedInstructions ? { instructions: mergedInstructions } : {}),
        ...(modeRef.current ? { mode: modeRef.current } : {}),
        ...(modelRef.current
          ? {
              provider: modelRef.current.provider,
              model: modelRef.current.model,
            }
          : {}),
      };
    },
  });

  const isBusy = status === "submitted" || status === "streaming";
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [instrOpen, setInstrOpen] = useState(false);
  const [instrDraft, setInstrDraft] = useState(instructions);
  const [mode, setMode] = useState<string | null>(null);
  modeRef.current = mode;
  const [tplOpen, setTplOpen] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});

  useEffect(() => {
    setFeedback(loadFeedback());
  }, []);

  // Voice: speech-to-text (mic) and text-to-speech (speak). Feature-detected.
  const [voice, setVoice] = useState({ stt: false, tts: false });
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setVoice({ stt: sttSupported(), tts: ttsSupported() });
    return () => {
      if (ttsSupported()) window.speechSynthesis.cancel();
      recognitionRef.current?.stop?.();
    };
  }, []);

  const messageToText = (m?: UIMessage) =>
    (m?.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n")
      .trim();

  const toggleMic = () => {
    if (!voice.stt) return;
    if (listening) {
      recognitionRef.current?.stop?.();
      return;
    }
    const rec = createRecognition();
    if (!rec) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const t = e?.results?.[0]?.[0]?.transcript ?? "";
      if (t) setInput((prev) => (prev ? `${prev} ${t}` : t));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const speak = (message: UIMessage) => {
    if (!voice.tts) return;
    const synth = window.speechSynthesis;
    if (speakingId === message.id) {
      synth.cancel();
      setSpeakingId(null);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(
      stripMarkdownForSpeech(messageToText(message))
    );
    u.onend = () => setSpeakingId(null);
    setSpeakingId(message.id);
    synth.speak(u);
  };

  const rate = (message: UIMessage, rating: Rating) => {
    const existing = feedback[message.id];
    const cleared = existing?.rating === rating;
    let reason: string | undefined;
    if (!cleared && rating === "down") {
      reason = window.prompt("What was wrong? (optional)") ?? undefined;
    }
    setFeedback((prev) => {
      const next = { ...prev };
      if (cleared) delete next[message.id];
      else next[message.id] = { rating, reason };
      saveFeedbackLocal(next);
      return next;
    });
    if (cleared) return;
    // Capture the prompt/answer text so feedback can seed eval cases later.
    const idx = messages.findIndex((m) => m.id === message.id);
    const prevUser =
      idx > 0
        ? [...messages.slice(0, idx)].reverse().find((m) => m.role === "user")
        : undefined;
    void fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        convoId: id,
        messageId: message.id,
        rating,
        reason,
        prompt: messageToText(prevUser) || undefined,
        answer: messageToText(message) || undefined,
      }),
    }).catch(() => {});
  };

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
    if (prefill && prefill.mode !== undefined) {
      setMode(prefill.mode);
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
        <span className="topbar-title wordmark">
          <span className="wm-accent">Az</span>Lens
        </span>
        <div className="topbar-spacer" />
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
        <button
          type="button"
          className={`approval-toggle ${instructions ? "on" : "off"}`}
          onClick={() => {
            setInstrDraft(instructions);
            setInstrOpen((o) => !o);
          }}
          aria-pressed={instrOpen}
          title="Per-conversation instructions"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 6h16M4 12h16M4 18h10"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          Instructions
        </button>
      </header>

      {instrOpen && (
        <div className="instructions-panel">
          <label htmlFor="conv-instructions">
            Instructions for this conversation
          </label>
          <textarea
            id="conv-instructions"
            className="instructions-input"
            value={instrDraft}
            onChange={(e) => setInstrDraft(e.target.value)}
            rows={4}
            placeholder="e.g. Always answer in TypeScript and cite Azure docs."
          />
          <div className="instructions-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onSetInstructions(instrDraft.trim());
                setInstrOpen(false);
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setInstrDraft("");
                onSetInstructions("");
                setInstrOpen(false);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setInstrOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
                            <MessageMarkdown key={i} text={part.text} />
                          ) : (
                            <p key={i}>{part.text}</p>
                          );
                        }
                        if (part.type === "tool-invocation") {
                          const inv = part.toolInvocation as Inv;
                          const awaiting =
                            inv.state === "call" &&
                            isSensitiveTool(inv.toolName);
                          return (
                            <ToolCard
                              key={i}
                              inv={inv}
                              awaiting={awaiting}
                              onApprove={() =>
                                approveTool(
                                  inv.toolCallId,
                                  inv.toolName,
                                  inv.args
                                )
                              }
                              onDeny={() => denyTool(inv.toolCallId)}
                            />
                          );
                        }
                        return null;
                      })}
                      {message.role === "assistant" &&
                        (() => {
                          const sources = extractSources(
                            messageToText(message)
                          );
                          if (sources.length === 0) return null;
                          return (
                            <div className="sources">
                              <span className="sources-label">Sources</span>
                              <ol className="sources-list">
                                {sources.map((s, i) => (
                                  <li key={i}>
                                    <a
                                      href={s.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      title={s.url}
                                    >
                                      {s.title}
                                    </a>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          );
                        })()}
                      <div className="msg-actions">
                        <button
                          type="button"
                          className="msg-action"
                          onClick={() => onBookmark(message)}
                          title="Bookmark this message"
                        >
                          Bookmark
                        </button>
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
                        {message.role === "assistant" && voice.tts && (
                          <button
                            type="button"
                            className={`msg-action ${
                              speakingId === message.id ? "rated" : ""
                            }`}
                            onClick={() => speak(message)}
                            title={
                              speakingId === message.id
                                ? "Stop speaking"
                                : "Read aloud"
                            }
                          >
                            {speakingId === message.id ? "◼ Stop" : "🔊 Speak"}
                          </button>
                        )}
                        {message.role === "assistant" && (
                          <>
                            <button
                              type="button"
                              className={`msg-action ${
                                feedback[message.id]?.rating === "up"
                                  ? "rated"
                                  : ""
                              }`}
                              onClick={() => rate(message, "up")}
                              title="Good response"
                              aria-label="Thumbs up"
                            >
                              👍
                            </button>
                            <button
                              type="button"
                              className={`msg-action ${
                                feedback[message.id]?.rating === "down"
                                  ? "rated"
                                  : ""
                              }`}
                              onClick={() => rate(message, "down")}
                              title="Bad response"
                              aria-label="Thumbs down"
                            >
                              👎
                            </button>
                          </>
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
                {message.role === "user" && (
                  <div className="avatar-user" aria-hidden="true">
                    You
                  </div>
                )}
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
            {error && !isBusy && (
              <div className="msg assistant">
                <Logo size={28} className="avatar-logo" />
                <div className="content">
                  <div className="chat-error">
                    <span className="chat-error-icon">!</span>
                    <span>{error.message}</span>
                  </div>
                  <div className="msg-actions">
                    <button
                      type="button"
                      className="msg-action"
                      onClick={() => reload()}
                    >
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {(() => {
        const total = messages.reduce(
          (s, m) => s + (routeInfo(m.annotations)?.costUsd ?? 0),
          0
        );
        const status = budgetStatus(total);
        if (status === "ok") return null;
        return (
          <div className={`budget-banner ${status}`} role="status">
            This session has used {formatUsd(total)} of{" "}
            {formatUsd(SESSION_BUDGET_USD)}
            {status === "over" ? " — over the session budget." : "."}
          </div>
        );
      })()}

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
              aria-label="Saved prompts"
              title="Saved prompts"
              onClick={() => setTplOpen((o) => !o)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 4h9l3 3v13a1 1 0 01-1 1H6a1 1 0 01-1-1V5a1 1 0 011-1z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 12h6M9 16h6"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            {tplOpen && (
              <div className="tpl-menu" onMouseLeave={() => setTplOpen(false)}>
                <div className="tpl-menu-head">
                  <span>Saved prompts</span>
                  <button
                    type="button"
                    className="tpl-save"
                    disabled={input.trim().length === 0}
                    onClick={() => {
                      const title = window.prompt(
                        "Name this prompt:",
                        input.trim().slice(0, 40)
                      );
                      if (title !== null) {
                        onSaveTemplate(title, input);
                        setTplOpen(false);
                      }
                    }}
                  >
                    Save current draft
                  </button>
                </div>
                {templates.length === 0 ? (
                  <div className="tpl-empty">
                    No saved prompts yet. Type a message, then “Save current
                    draft”.
                  </div>
                ) : (
                  <ul className="tpl-list">
                    {templates.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          className="tpl-item"
                          title={t.text}
                          onClick={() => {
                            setInput(t.text);
                            setTplOpen(false);
                            textareaRef.current?.focus();
                          }}
                        >
                          {t.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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
            {voice.stt && (
              <button
                type="button"
                className={`attach mic ${listening ? "listening" : ""}`}
                aria-label={listening ? "Stop dictation" : "Dictate message"}
                title={
                  listening ? "Stop dictation" : "Dictate (speech to text)"
                }
                onClick={toggleMic}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="9"
                    y="3"
                    width="6"
                    height="11"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <path
                    d="M5 11a7 7 0 0014 0M12 18v3"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
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
            {providers.length > 0 && modelSelection && (
              <select
                className="composer-model"
                value={`${modelSelection.provider}::${modelSelection.model}`}
                onChange={(e) => {
                  const [provider, model] = e.target.value.split("::");
                  onSelectModel({ provider, model });
                }}
                title="Model for this message"
              >
                {providers.map((p) =>
                  p.models.map((mm) => (
                    <option key={`${p.id}::${mm}`} value={`${p.id}::${mm}`}>
                      {p.label} · {mm}
                    </option>
                  ))
                )}
              </select>
            )}
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
        <div className="composer-modes">
          {COMPOSER_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`mode-chip ${mode === m.id ? "active" : ""}`}
              onClick={() => setMode(mode === m.id ? null : m.id)}
              aria-pressed={mode === m.id}
              title={m.label}
            >
              <span className="mode-glyph">{m.glyph}</span>
              {m.label}
            </button>
          ))}
        </div>
        <p className="disclaimer">
          AzLens can use MCP tools to act on your behalf.
        </p>
      </div>
    </div>
  );
}
