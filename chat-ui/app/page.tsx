"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import CommandPalette from "@/components/CommandPalette";
import {
  type Conversation,
  type Theme,
  type ModelSelection,
  type ModelProvider,
  loadConversations,
  saveConversations,
  loadActive,
  saveActive,
  saveMessages,
  deleteMessages,
  titleFromMessages,
  loadTheme,
  saveTheme,
  loadModel,
  saveModel,
  loadAgentId,
  saveAgentId,
  loadApproval,
  saveApproval,
  newId,
} from "@/lib/storage";
import { DEFAULT_AGENT_ID } from "@/lib/agents";
import {
  downloadFile,
  exportChatMarkdown,
  exportAllJson,
  importAllJson,
} from "@/lib/transfer";

export default function Page() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [modelSel, setModelSel] = useState<ModelSelection | null>(null);
  const [agentId, setAgentId] = useState<string>(DEFAULT_AGENT_ID);
  const [requireApproval, setRequireApproval] = useState(true);
  const [prefill, setPrefill] = useState<{
    text: string;
    nonce: number;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  // Mirror of conversations for stable reads inside effects/callbacks.
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;

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
    setAgentId(loadAgentId() ?? DEFAULT_AGENT_ID);
    setRequireApproval(loadApproval());
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

  // Discover which model providers are configured on the server.
  useEffect(() => {
    let alive = true;
    fetch("/api/models")
      .then((r) => r.json())
      .then((list: ModelProvider[]) => {
        if (!alive) return;
        setProviders(list);
        const saved = loadModel();
        if (
          saved &&
          list.some(
            (p) => p.id === saved.provider && p.models.includes(saved.model)
          )
        ) {
          setModelSel(saved);
        } else if (list.length > 0) {
          const sel = { provider: list[0].id, model: list[0].models[0] };
          setModelSel(sel);
          saveModel(sel);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback((list: Conversation[]) => {
    setConversations(list);
    saveConversations(list);
  }, []);

  // When the active chat changes, apply that chat's saved agent/model (or fall
  // back to the global defaults for chats that don't have their own).
  useEffect(() => {
    if (!ready) return;
    const convo = conversationsRef.current.find((c) => c.id === activeId);
    setAgentId(convo?.agentId ?? loadAgentId() ?? DEFAULT_AGENT_ID);
    const m = convo?.model ?? loadModel();
    if (m) setModelSel(m);
  }, [activeId, ready]);

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

  const togglePin = useCallback((id: string) => {
    setConversations((prev) => {
      const list = prev.map((c) =>
        c.id === id ? { ...c, pinned: !c.pinned } : c
      );
      saveConversations(list);
      return list;
    });
  }, []);

  const changeModel = useCallback(
    (sel: ModelSelection) => {
      setModelSel(sel);
      saveModel(sel); // global default for future new chats
      setConversations((prev) => {
        const list = prev.map((c) =>
          c.id === activeId ? { ...c, model: sel } : c
        );
        saveConversations(list);
        return list;
      });
    },
    [activeId]
  );

  const changeAgent = useCallback(
    (id: string) => {
      setAgentId(id);
      saveAgentId(id); // global default for future new chats
      setConversations((prev) => {
        const list = prev.map((c) =>
          c.id === activeId ? { ...c, agentId: id } : c
        );
        saveConversations(list);
        return list;
      });
    },
    [activeId]
  );

  const toggleApproval = useCallback(() => {
    setRequireApproval((prev) => {
      const next = !prev;
      saveApproval(next);
      return next;
    });
  }, []);

  const useTool = useCallback((text: string) => {
    setPrefill({ text, nonce: Date.now() });
  }, []);

  const exportChat = useCallback(() => {
    const convo = conversations.find((c) => c.id === activeId);
    if (!convo) return;
    const name = (convo.title.replace(/[^\w\- ]+/g, "").trim() || "chat").slice(
      0,
      40
    );
    downloadFile(`${name}.md`, exportChatMarkdown(convo), "text/markdown");
  }, [conversations, activeId]);

  const exportAllChats = useCallback(() => {
    downloadFile(
      "azlens-chats.json",
      exportAllJson(conversations),
      "application/json"
    );
  }, [conversations]);

  const triggerImport = useCallback(() => importInputRef.current?.click(), []);

  const onImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          const imported = importAllJson(await file.text());
          setConversations((prev) => {
            const map = new Map(prev.map((c) => [c.id, c]));
            imported.forEach((c) => map.set(c.id, c));
            const list = Array.from(map.values());
            saveConversations(list);
            return list;
          });
        } catch (err) {
          alert(`Import failed: ${(err as Error).message}`);
        }
      }
      if (importInputRef.current) importInputRef.current.value = "";
    },
    []
  );

  // Persist messages and keep the conversation title/order in sync.
  const handleMessages = useCallback((id: string, messages: UIMessage[]) => {
    saveMessages(id, messages);
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      const current = prev[idx];
      if (current.renamed) return prev;
      const nextTitle = titleFromMessages(messages);
      // Only touch state when the derived title actually changes (once, when
      // the first user message arrives) — never on every streamed token.
      if (!nextTitle || nextTitle === current.title) return prev;
      const list = [...prev];
      list[idx] = { ...current, title: nextTitle, updatedAt: Date.now() };
      saveConversations(list);
      return list;
    });
  }, []);

  if (!ready) return null;

  return (
    <div className={`layout ${collapsed ? "collapsed" : ""}`}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        collapsed={collapsed}
        theme={theme}
        onToggle={() => setCollapsed((v) => !v)}
        onOpenPalette={() => setPaletteOpen(true)}
        onNew={newChat}
        onSelect={selectChat}
        onDelete={deleteChat}
        onRename={renameChat}
        onTogglePin={togglePin}
        onUseTool={useTool}
        onClearAll={clearAll}
        onToggleTheme={toggleTheme}
      />
      <ChatArea
        key={activeId}
        id={activeId}
        providers={providers}
        modelSelection={modelSel}
        onSelectModel={changeModel}
        agentId={agentId}
        onSelectAgent={changeAgent}
        requireApproval={requireApproval}
        onToggleApproval={toggleApproval}
        prefill={prefill}
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
          onExportChat={exportChat}
          onExportAll={exportAllChats}
          onImport={triggerImport}
        />
      )}
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={onImportFile}
      />
    </div>
  );
}
