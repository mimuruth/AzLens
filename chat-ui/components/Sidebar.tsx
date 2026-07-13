"use client";

import { useState } from "react";
import type { Conversation } from "@/lib/storage";

export default function Sidebar({
  conversations,
  activeId,
  collapsed,
  onToggle,
  onNew,
  onSelect,
  onDelete,
  onClearAll,
}: {
  conversations: Conversation[];
  activeId: string;
  collapsed: boolean;
  onToggle: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = conversations
    .filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <div className="sidebar-inner">
        <div className="sidebar-head">
          <div className="brand">
            <span className="logo" aria-hidden />
            <span>AzLens</span>
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

        <div className="section-label">Recents</div>
        <nav className="chat-list">
          {filtered.length === 0 && (
            <p className="empty-list">No chats found.</p>
          )}
          {filtered.map((c) => (
            <div
              key={c.id}
              className={`chat-item ${c.id === activeId ? "active" : ""}`}
              onClick={() => onSelect(c.id)}
            >
              <span className="chat-title">{c.title}</span>
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
          ))}
        </nav>

        <div className="sidebar-foot">
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
