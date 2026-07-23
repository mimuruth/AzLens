"use client";

import { useEffect, useState } from "react";
import {
  type Conversation,
  type Theme,
  type Bookmark,
  type PromptTemplate,
  groupByDate,
} from "@/lib/storage";
import Logo from "@/components/Logo";

type ServerHealth = { name: string; ok: boolean; configured: boolean };

type LibraryPrompt = {
  server: string;
  name: string;
  title?: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
};

type LibraryResource = {
  server: string;
  name: string;
  uri: string;
  title?: string;
  description?: string;
  mimeType?: string;
};

/** Example prompts per server tool, used when a tool is clicked. */
const SERVER_TOOLS: Record<string, { name: string; example: string }[]> = {
  "mcp-local-coder": [
    { name: "read_file", example: "Read the file README.md" },
    {
      name: "write_file",
      example: "Create a file notes.txt containing 'hello world'",
    },
    { name: "search_code", example: "Search the code for 'TODO'" },
  ],
  "AzLens-mcp": [
    {
      name: "query_azure_resource",
      example:
        "Query the Azure resource /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Web/sites/<name>",
    },
    { name: "run_kql_query", example: "Run KQL query: AzureActivity | take 5" },
    {
      name: "search_wiki",
      example: "Search the wiki for Azure Functions triggers and bindings",
    },
  ],
  "mcp-personal-assistant": [
    { name: "get_daily_notes", example: "Show my notes for 2025-01-01" },
    {
      name: "update_todo_list",
      example: "Add 'ship v1' to my to-do list with status done",
    },
  ],
  "mcp-github": [
    {
      name: "search_repositories",
      example: "Search GitHub for popular typescript MCP repositories",
    },
    {
      name: "get_repository",
      example: "Get the GitHub repository modelcontextprotocol/servers",
    },
    {
      name: "list_issues",
      example: "List open issues in modelcontextprotocol/servers",
    },
  ],
  "mcp-azure-cost": [
    {
      name: "query_cost",
      example: "Show my Azure cost this month grouped by service",
    },
    {
      name: "get_cost_forecast",
      example: "Forecast my Azure spend for this month",
    },
    {
      name: "list_budgets",
      example: "List my Azure budgets and current spend",
    },
  ],
  "mcp-knowledge": [
    {
      name: "search_knowledge",
      example: "Search the knowledge base for our data retention policy",
    },
    {
      name: "get_document",
      example: "Get the knowledge base document with key doc-42",
    },
  ],
  "mcp-postgres": [
    { name: "list_tables", example: "List the tables in the database" },
    {
      name: "describe_table",
      example: "Describe the columns of the orders table",
    },
    {
      name: "query",
      example: "Run: SELECT count(*) FROM orders WHERE status = 'open'",
    },
  ],
};

export default function Sidebar({
  conversations,
  activeId,
  collapsed,
  theme,
  onToggle,
  onOpenPalette,
  onNew,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
  onUseTool,
  onClearAll,
  onToggleTheme,
  bookmarks,
  templates,
  onSelectBookmark,
  onRemoveBookmark,
  onInsertTemplate,
  onRemoveTemplate,
}: {
  conversations: Conversation[];
  activeId: string;
  collapsed: boolean;
  theme: Theme;
  onToggle: () => void;
  onOpenPalette: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onUseTool: (prompt: string) => void;
  onClearAll: () => void;
  onToggleTheme: () => void;
  bookmarks: Bookmark[];
  templates: PromptTemplate[];
  onSelectBookmark: (convoId: string) => void;
  onRemoveBookmark: (id: string) => void;
  onInsertTemplate: (text: string) => void;
  onRemoveTemplate: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [toolsOpen, setToolsOpen] = useState(true);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [servers, setServers] = useState<ServerHealth[]>([]);
  const [libOpen, setLibOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [library, setLibrary] = useState<{
    prompts: LibraryPrompt[];
    resources: LibraryResource[];
  }>({ prompts: [], resources: [] });

  // Poll MCP server health.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/mcp/health", { cache: "no-store" });
        const data = (await res.json()) as ServerHealth[];
        if (alive) setServers(data);
      } catch {
        /* ignore */
      }
    };
    load();
    const timer = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Load MCP prompts + resources (the in-app library).
  useEffect(() => {
    let alive = true;
    fetch("/api/mcp/library")
      .then((r) => r.json())
      .then((lib) => {
        if (alive) setLibrary(lib);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function usePrompt(p: LibraryPrompt) {
    const args: Record<string, string> = {};
    for (const a of p.arguments ?? []) {
      const v = window.prompt(
        `${p.title ?? p.name} — ${a.description ?? a.name}`,
        ""
      );
      if (v === null) return; // cancelled
      args[a.name] = v;
    }
    try {
      const res = await fetch("/api/mcp/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "prompt",
          server: p.server,
          name: p.name,
          args,
        }),
      });
      const json = await res.json();
      if (json.text) onUseTool(json.text);
    } catch {
      /* ignore */
    }
  }

  async function useResource(r: LibraryResource) {
    try {
      const res = await fetch("/api/mcp/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "resource",
          server: r.server,
          uri: r.uri,
        }),
      });
      const json = await res.json();
      if (json.text) {
        onUseTool(
          `Context from ${r.title ?? r.name} (${r.uri}):\n\n${json.text}\n\n`
        );
      }
    } catch {
      /* ignore */
    }
  }

  const filtered = conversations
    .filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const pinned = filtered.filter((c) => c.pinned);
  const groups = groupByDate(filtered.filter((c) => !c.pinned));

  function startRename(c: Conversation) {
    setEditingId(c.id);
    setEditValue(c.title);
  }

  function commitRename() {
    if (editingId) {
      const t = editValue.trim();
      if (t) onRename(editingId, t);
    }
    setEditingId(null);
  }

  function dotClass(s: ServerHealth) {
    if (!s.configured) return "dot muted";
    return s.ok ? "dot ok" : "dot bad";
  }

  function renderItem(c: Conversation) {
    return (
      <div
        key={c.id}
        className={`chat-item ${c.id === activeId ? "active" : ""}`}
        onClick={() => onSelect(c.id)}
        onDoubleClick={() => startRename(c)}
      >
        {editingId === c.id ? (
          <input
            className="chat-rename"
            value={editValue}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditingId(null);
            }}
          />
        ) : (
          <span className="chat-title" title="Double-click to rename">
            {c.title}
          </span>
        )}
        <button
          className={`chat-pin ${c.pinned ? "pinned" : ""}`}
          aria-label={c.pinned ? "Unpin chat" : "Pin chat"}
          title={c.pinned ? "Unpin" : "Pin"}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(c.id);
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={c.pinned ? "currentColor" : "none"}
          >
            <path
              d="M12 2l2.9 6 6.6.6-5 4.3 1.5 6.5L12 22l-6-2.6L7.5 13l-5-4.4 6.6-.6z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          className="chat-del"
          aria-label="Delete chat"
          title="Delete chat"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(c.id);
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a1 1 0 001 1h6a1 1 0 001-1V7"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    );
  }

  if (collapsed) {
    return (
      <aside className="sidebar is-collapsed">
        <div className="rail">
          <button
            className="icon-btn"
            onClick={onToggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
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
          <button
            className="icon-btn rail-new"
            onClick={onNew}
            aria-label="New chat"
            title="New chat"
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
          <button
            className="icon-btn"
            onClick={onOpenPalette}
            aria-label="Search"
            title="Search (Cmd/Ctrl+K)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle
                cx="11"
                cy="11"
                r="7"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M21 21l-4-4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="rail-spacer" />
          <button
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="4.5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path
                  d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <div className="sidebar-inner">
        <div className="sidebar-head">
          <div className="brand">
            <Logo size={24} />
            <span className="wordmark">
              <span className="wm-accent">Az</span>Lens
            </span>
          </div>
          <button
            className="icon-btn"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
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
        </div>

        <button className="new-chat" onClick={onNew}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          New chat
        </button>

        <div className="search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle
              cx="11"
              cy="11"
              r="7"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M21 21l-4-4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
          />
        </div>

        <nav className="chat-list">
          {filtered.length === 0 && (
            <p className="empty-list">No chats found.</p>
          )}
          {pinned.length > 0 && (
            <div>
              <div className="section-label">Pinned</div>
              {pinned.map((c) => renderItem(c))}
            </div>
          )}
          {groups.map((group) => (
            <div key={group.label}>
              <div className="section-label">{group.label}</div>
              {group.items.map((c) => renderItem(c))}
            </div>
          ))}
        </nav>

        <div className="tools-panel">
          <button
            className="tools-head"
            onClick={() => setToolsOpen((v) => !v)}
            aria-expanded={toolsOpen}
          >
            <span>MCP tools</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className={toolsOpen ? "chev open" : "chev"}
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {toolsOpen && (
            <div className="tools-list">
              {servers.length === 0 && <p className="empty-list">Checking…</p>}
              {servers.map((s) => {
                const tools = SERVER_TOOLS[s.name] ?? [];
                const open = expandedServer === s.name;
                return (
                  <div key={s.name}>
                    <button
                      className="tool-row server"
                      onClick={() => setExpandedServer(open ? null : s.name)}
                      aria-expanded={open}
                      title="Show tools"
                    >
                      <span className={dotClass(s)} />
                      <span className="tool-name">{s.name}</span>
                      <span className="tool-status">
                        {!s.configured ? "off" : s.ok ? "online" : "down"}
                      </span>
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
                    </button>
                    {open && tools.length > 0 && (
                      <div className="tool-actions">
                        {tools.map((t) => (
                          <button
                            key={t.name}
                            className="tool-action"
                            onClick={() => onUseTool(t.example)}
                            title={`Draft: ${t.example}`}
                          >
                            <code>{t.name}</code>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {library.prompts.length + library.resources.length > 0 && (
          <div className="tools-panel">
            <button
              className="tools-head"
              onClick={() => setLibOpen((v) => !v)}
              aria-expanded={libOpen}
            >
              <span>Prompts &amp; resources</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                className={libOpen ? "chev open" : "chev"}
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {libOpen && (
              <div className="tools-list">
                {library.prompts.length > 0 && (
                  <p className="lib-label">Prompts</p>
                )}
                {library.prompts.map((p) => (
                  <button
                    key={`${p.server}:${p.name}`}
                    className="lib-item"
                    onClick={() => usePrompt(p)}
                    title={p.description ?? p.name}
                  >
                    <span className="lib-glyph">/</span>
                    <span className="lib-text">{p.title ?? p.name}</span>
                  </button>
                ))}
                {library.resources.length > 0 && (
                  <p className="lib-label">Resources</p>
                )}
                {library.resources.map((r) => (
                  <button
                    key={`${r.server}:${r.uri}`}
                    className="lib-item"
                    onClick={() => useResource(r)}
                    title={r.description ?? r.uri}
                  >
                    <span className="lib-glyph">@</span>
                    <span className="lib-text">{r.title ?? r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {bookmarks.length + templates.length > 0 && (
          <div className="tools-panel">
            <button
              className="tools-head"
              onClick={() => setSavedOpen((v) => !v)}
              aria-expanded={savedOpen}
            >
              <span>Saved ({bookmarks.length + templates.length})</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                className={savedOpen ? "chev open" : "chev"}
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {savedOpen && (
              <div className="tools-list">
                {templates.length > 0 && <p className="lib-label">Prompts</p>}
                {templates.map((t) => (
                  <div key={t.id} className="saved-row">
                    <button
                      className="lib-item saved-main"
                      onClick={() => onInsertTemplate(t.text)}
                      title={t.text}
                    >
                      <span className="lib-glyph">/</span>
                      <span className="lib-text">{t.title}</span>
                    </button>
                    <button
                      className="saved-remove"
                      aria-label="Delete prompt"
                      onClick={() => onRemoveTemplate(t.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {bookmarks.length > 0 && <p className="lib-label">Bookmarks</p>}
                {bookmarks.map((b) => (
                  <div key={b.id} className="saved-row">
                    <button
                      className="lib-item saved-main"
                      onClick={() => onSelectBookmark(b.convoId)}
                      title={b.text}
                    >
                      <span className="lib-glyph">★</span>
                      <span className="lib-text">
                        {b.text.replace(/\s+/g, " ").slice(0, 48)}
                      </span>
                    </button>
                    <button
                      className="saved-remove"
                      aria-label="Delete bookmark"
                      onClick={() => onRemoveBookmark(b.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="sidebar-foot">
          <button className="foot-btn" onClick={onToggleTheme}>
            {theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="4.5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path
                  d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button className="foot-btn" onClick={onClearAll}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a1 1 0 001 1h6a1 1 0 001-1V7"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Clear all chats
          </button>
          <div className="user-row">
            <span className="user-avatar" aria-hidden>
              U
            </span>
            <span>You</span>
          </div>
          <p className="credit">Developed by Michael M</p>
        </div>
      </div>
    </aside>
  );
}
