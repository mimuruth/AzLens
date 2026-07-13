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
import Logo from "@/components/Logo";

export default function ChatArea({
  id,
  providers,
  modelSelection,
  onSelectModel,
  prefill,
  onMessages,
  onToggleSidebar,
}: {
  id: string;
  providers: ModelProvider[];
  modelSelection: ModelSelection | null;
  onSelectModel: (sel: ModelSelection) => void;
  prefill: { text: string; nonce: number } | null;
  onMessages: (id: string, messages: UIMessage[]) => void;
  onToggleSidebar: () => void;
}) {
  const { messages, input, handleInputChange, handleSubmit, status, setInput } =
    useChat({
      id,
      initialMessages: loadMessages(id),
    });

  const isBusy = status === "submitted" || status === "streaming";
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

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

    const options: {
      experimental_attachments?: FileList;
      body?: Record<string, unknown>;
    } = {};
    if (attachments.length > 0) {
      const dt = new DataTransfer();
      attachments.forEach((file) => dt.items.add(file));
      options.experimental_attachments = dt.files;
    }
    if (modelSelection) {
      options.body = {
        provider: modelSelection.provider,
        model: modelSelection.model,
      };
    }

    handleSubmit(e, options);
    setAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const isEmpty = messages.length === 0;

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
                      return (
                        <div key={i} className="tool">
                          <span className="tool-dot" />
                          used <code>{part.toolInvocation.toolName}</code>
                        </div>
                      );
                    }
                    return null;
                  })}
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
            <button
              className="send"
              type="submit"
              disabled={isBusy || !canSend}
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
