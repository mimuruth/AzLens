"use client";

import { useCallback, useEffect, useState } from "react";
import type { UIMessage } from "ai";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import CommandPalette from "@/components/CommandPalette";
import {
  type Conversation,
  type Theme,
  loadConversations,
  saveConversations,
  loadActive,
  saveActive,
  saveMessages,
  deleteMessages,
  titleFromMessages,
  loadTheme,
  saveTheme,
  newId,
} from "@/lib/storage";

export default function Page() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // Load persisted state on mount (client only, avoids hydration mismatch).
  useEffect(() => {
    let list = loadConversations();
    let active = loadActive() ?? "";
    if (list.length === 0) {
      const id = newId();
      list = [{ id, title: "New chat", updatedAt: Date.now() }];
      active = id;
      saveConversations(list);
      saveActive(id);
    }
    if (!list.some((c) => c.id === active)) active = list[0].id;
    const t = loadTheme();
    document.documentElement.setAttribute("data-theme", t);
    setTheme(t);
    setConversations(list);
    setActiveId(active);
    setReady(true);
  }, []);

  // Global Cmd/Ctrl+K to toggle the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const persist = useCallback((list: Conversation[]) => {
    setConversations(list);
    saveConversations(list);
  }, []);

  const newChat = useCallback(() => {
    const id = newId();
    setConversations((prev) => {
      const list = [{ id, title: "New chat", updatedAt: Date.now() }, ...prev];
      saveConversations(list);
      return list;
    });
    setActiveId(id);
    saveActive(id);
  }, []);

  const selectChat = useCallback((id: string) => {
    setActiveId(id);
    saveActive(id);
  }, []);

  const renameChat = useCallback((id: string, title: string) => {
    setConversations((prev) => {
      const list = prev.map((c) =>
        c.id === id ? { ...c, title, renamed: true } : c
      );
      saveConversations(list);
      return list;
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      saveTheme(next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }, []);

  const deleteChat = useCallback(
    (id: string) => {
      deleteMessages(id);
      setConversations((prev) => {
        let list = prev.filter((c) => c.id !== id);
        if (list.length === 0) {
          const nid = newId();
          list = [{ id: nid, title: "New chat", updatedAt: Date.now() }];
          setActiveId(nid);
          saveActive(nid);
        } else if (id === activeId) {
          setActiveId(list[0].id);
          saveActive(list[0].id);
        }
        saveConversations(list);
        return list;
      });
    },
    [activeId]
  );

  const clearAll = useCallback(() => {
    setConversations((prev) => {
      prev.forEach((c) => deleteMessages(c.id));
      const nid = newId();
      const list = [{ id: nid, title: "New chat", updatedAt: Date.now() }];
      saveConversations(list);
      setActiveId(nid);
      saveActive(nid);
      return list;
    });
  }, []);

  // Persist messages and keep the conversation title/order in sync.
  const handleMessages = useCallback(
    (id: string, messages: UIMessage[]) => {
      saveMessages(id, messages);
      const nextTitle = titleFromMessages(messages);
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === id);
        if (idx < 0) return prev;
        const current = prev[idx];
        const title = current.renamed
          ? current.title
          : nextTitle ?? current.title;
        if (title === current.title && messages.length === 0) return prev;
        const list = [...prev];
        list[idx] = { ...current, title, updatedAt: Date.now() };
        saveConversations(list);
        return list;
      });
    },
    []
  );

  if (!ready) return null;

  return (
    <div className={`layout ${collapsed ? "collapsed" : ""}`}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        collapsed={collapsed}
        theme={theme}
        onToggle={() => setCollapsed((v) => !v)}
        onNew={newChat}
        onSelect={selectChat}
        onDelete={deleteChat}
        onRename={renameChat}
        onClearAll={clearAll}
        onToggleTheme={toggleTheme}
      />
      <ChatArea
        key={activeId}
        id={activeId}
        onMessages={handleMessages}
        onToggleSidebar={() => setCollapsed((v) => !v)}
      />
      {paletteOpen && (
        <CommandPalette
          conversations={conversations}
          onClose={() => setPaletteOpen(false)}
          onNew={newChat}
          onSelect={selectChat}
          onToggleTheme={toggleTheme}
        />
      )}
    </div>
  );
}
