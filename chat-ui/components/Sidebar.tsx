"use client";

import { useEffect, useState } from "react";
import { type Conversation, type Theme, groupByDate } from "@/lib/storage";
import Logo from "@/components/Logo";

type ServerHealth = { name: string; ok: boolean; configured: boolean };

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
  onClearAll,
  onToggleTheme,
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
  onClearAll: () => void;
  onToggleTheme: () => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [toolsOpen, setToolsOpen] = useState(true);
  const [servers, setServers] = useState<ServerHealth[]>([]);

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
          <button className="icon-btn" onClick={onToggle} aria-label="Expand sidebar" title="Expand sidebar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M9 4v16" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
          <button className="icon-btn rail-new" onClick={onNew} aria-label="New chat" title="New chat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button className="icon-btn" onClick={onOpenPalette} aria-label="Search" title="Search (Cmd/Ctrl+K)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <div className="rail-spacer" />
          <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme" title="Toggle theme">
            {theme === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.7" />
                <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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
            <span>AzLens</span>
          </div>
          <button
            className="icon-btn"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M9 4v16" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
        </div>

        <button className="new-chat" onClick={onNew}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          New chat
        </button>

        <div className="search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
          />
        </div>

        <nav className="chat-list">
          {filtered.length === 0 && <p className="empty-list">No chats found.</p>}
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
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {toolsOpen && (
            <div className="tools-list">
              {servers.length === 0 && <p className="empty-list">Checking…</p>}
              {servers.map((s) => (
                <div key={s.name} className="tool-row">
                  <span className={dotClass(s)} />
                  <span className="tool-name">{s.name}</span>
                  <span className="tool-status">
                    {!s.configured ? "off" : s.ok ? "online" : "down"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sidebar-foot">
          <button className="foot-btn" onClick={onToggleTheme}>
            {theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.7" />
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
