"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation } from "@/lib/storage";

type Item =
  | { type: "action"; id: string; label: string }
  | { type: "chat"; id: string; label: string };

export default function CommandPalette({
  conversations,
  onClose,
  onNew,
  onSelect,
  onToggleTheme,
  onExportChat,
  onExportAll,
  onImport,
}: {
  conversations: Conversation[];
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onToggleTheme: () => void;
  onExportChat: () => void;
  onExportAll: () => void;
  onImport: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.toLowerCase();
  const actions: Item[] = (
    [
      { type: "action", id: "new", label: "New chat" },
      { type: "action", id: "theme", label: "Toggle dark mode" },
      { type: "action", id: "export", label: "Export current chat (Markdown)" },
      { type: "action", id: "export-all", label: "Export all chats (JSON)" },
      { type: "action", id: "import", label: "Import chats (JSON)" },
    ] as Item[]
  ).filter((a) => a.label.toLowerCase().includes(q));

  const chats: Item[] = conversations
    .filter((c) => c.title.toLowerCase().includes(q))
    .slice(0, 8)
    .map((c) => ({ type: "chat", id: c.id, label: c.title }));

  const items = [...actions, ...chats];
  const clampedActive = Math.min(active, Math.max(items.length - 1, 0));

  function run(item: Item) {
    if (item.type === "action") {
      if (item.id === "new") onNew();
      if (item.id === "theme") onToggleTheme();
      if (item.id === "export") onExportChat();
      if (item.id === "export-all") onExportAll();
      if (item.id === "import") onImport();
    } else {
      onSelect(item.id);
    }
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[clampedActive]) run(items[clampedActive]);
    }
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div
        className="palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="Search chats or run a command…"
        />
        <div className="palette-list">
          {items.length === 0 && <div className="palette-empty">No results</div>}
          {actions.length > 0 && <div className="palette-label">Actions</div>}
          {actions.map((item) => {
            const i = items.indexOf(item);
            return (
              <button
                key={`a-${item.id}`}
                className={`palette-item ${i === clampedActive ? "active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(item)}
              >
                {item.label}
              </button>
            );
          })}
          {chats.length > 0 && <div className="palette-label">Chats</div>}
          {chats.map((item) => {
            const i = items.indexOf(item);
            return (
              <button
                key={`c-${item.id}`}
                className={`palette-item ${i === clampedActive ? "active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(item)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="palette-foot">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
