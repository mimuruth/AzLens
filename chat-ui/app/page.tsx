"use client";

import { useChat } from "@ai-sdk/react";

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, status, error } =
    useChat();

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <div className="app">
      <header className="header">
        <h1>MCP Chat</h1>
        <span className="subtitle">Powered by Azure OpenAI + MCP tools</span>
      </header>

      <main className="messages">
        {messages.length === 0 && (
          <div className="empty">
            <p>Ask me to read a file, query an Azure resource, or update your to-do list.</p>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`row ${message.role}`}>
            <div className="bubble">
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  return <span key={i}>{part.text}</span>;
                }
                if (part.type === "tool-invocation") {
                  return (
                    <div key={i} className="tool">
                      🔧 called <code>{part.toolInvocation.toolName}</code>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {error && <div className="row assistant"><div className="bubble errorText">{error.message}</div></div>}
      </main>

      <form className="composer" onSubmit={handleSubmit}>
        <input
          className="input"
          value={input}
          onChange={handleInputChange}
          placeholder="Send a message…"
          disabled={isBusy}
          autoFocus
        />
        <button className="send" type="submit" disabled={isBusy || input.trim().length === 0}>
          {isBusy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
