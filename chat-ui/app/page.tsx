"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import CommandPalette from "@/components/CommandPalette";
import ArtifactsPanel from "@/components/ArtifactsPanel";
import ProjectsModal from "@/components/ProjectsModal";
import {
  type Conversation,
  type Theme,
  type ModelSelection,
  type ModelProvider,
  type Bookmark,
  type PromptTemplate,
  type Project,
  loadConversations,
  saveConversations,
  loadActive,
  saveActive,
  loadMessages,
  saveMessages,
  deleteMessages,
  titleFromMessages,
  messageText,
  loadTheme,
  saveTheme,
  loadModel,
  saveModel,
  loadAgentId,
  saveAgentId,
  loadApproval,
  saveApproval,
  loadBookmarks,
  saveBookmarks,
  loadTemplates,
  saveTemplates,
  loadProjects,
  saveProjects,
  loadActiveProject,
  saveActiveProject,
  newId,
} from "@/lib/storage";
import { DEFAULT_AGENT_ID } from "@/lib/agents";
import { cloudInit, cloudMessages, cloudSave, cloudDelete } from "@/lib/cloud";
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
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [prefill, setPrefill] = useState<{
    text: string;
    nonce: number;
    mode?: string | null;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  // Mirror of conversations for stable reads inside effects/callbacks.
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;

  // Load persisted state on mount (client only, avoids hydration mismatch).
  useEffect(() => {
    const t = loadTheme();
    document.documentElement.setAttribute("data-theme", t);
    setTheme(t);
    setAgentId(loadAgentId() ?? DEFAULT_AGENT_ID);
    setRequireApproval(loadApproval());
    setBookmarks(loadBookmarks());
    setTemplates(loadTemplates());
    setProjects(loadProjects());
    setActiveProjectId(loadActiveProject());

    void (async () => {
      let list = loadConversations();
      let active = loadActive() ?? "";
      const wasEmpty = list.length === 0;

      // On a fresh device, hydrate conversations from the cloud when the
      // server has Cosmos-backed history enabled. Local data always wins if it
      // already exists (avoids clobbering unsynced work).
      try {
        const cloud = await cloudInit();
        if (cloud.enabled && wasEmpty && cloud.conversations.length > 0) {
          list = cloud.conversations;
          for (const c of list) {
            saveMessages(c.id, await cloudMessages(c.id));
          }
          saveConversations(list);
          active = list[0].id;
          saveActive(active);
        }
      } catch {
        /* offline or disabled — fall back to local storage */
      }

      if (list.length === 0) {
        const id = newId();
        list = [{ id, title: "New chat", updatedAt: Date.now() }];
        active = id;
        saveConversations(list);
        saveActive(id);
      }
      if (!list.some((c) => c.id === active)) active = list[0].id;
      setConversations(list);
      setActiveId(active);
      setReady(true);
    })();
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
      const convo: Conversation = {
        id,
        title: "New chat",
        updatedAt: Date.now(),
        ...(activeProjectId ? { projectId: activeProjectId } : {}),
      };
      const list = [convo, ...prev];
      saveConversations(list);
      return list;
    });
    setActiveId(id);
    saveActive(id);
  }, [activeProjectId]);

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
      const updated = list.find((c) => c.id === id);
      if (updated) cloudSave(updated, loadMessages(id));
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
      cloudDelete(id);
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
      prev.forEach((c) => {
        deleteMessages(c.id);
        cloudDelete(c.id);
      });
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
      const updated = list.find((c) => c.id === id);
      if (updated) cloudSave(updated, loadMessages(id));
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
        const updated = list.find((c) => c.id === activeId);
        if (updated) cloudSave(updated, loadMessages(activeId));
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
        const updated = list.find((c) => c.id === activeId);
        if (updated) cloudSave(updated, loadMessages(activeId));
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

  const useTool = useCallback((text: string, mode?: string | null) => {
    setPrefill({ text, nonce: Date.now(), mode });
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

  const changeInstructions = useCallback(
    (text: string) => {
      setConversations((prev) => {
        const list = prev.map((c) =>
          c.id === activeId ? { ...c, instructions: text } : c
        );
        saveConversations(list);
        const updated = list.find((c) => c.id === activeId);
        if (updated) cloudSave(updated, loadMessages(activeId));
        return list;
      });
    },
    [activeId]
  );

  const addBookmark = useCallback(
    (message: UIMessage) => {
      const text = messageText(message);
      if (!text.trim()) return;
      setBookmarks((prev) => {
        const bm: Bookmark = {
          id: newId(),
          convoId: activeId,
          role: message.role,
          text,
          createdAt: Date.now(),
        };
        const list = [bm, ...prev].slice(0, 200);
        saveBookmarks(list);
        return list;
      });
    },
    [activeId]
  );

  const removeBookmark = useCallback((id: string) => {
    setBookmarks((prev) => {
      const list = prev.filter((b) => b.id !== id);
      saveBookmarks(list);
      return list;
    });
  }, []);

  const saveTemplate = useCallback((title: string, text: string) => {
    const t = text.trim();
    if (!t) return;
    setTemplates((prev) => {
      const tpl: PromptTemplate = {
        id: newId(),
        title: (title.trim() || t.slice(0, 32)).slice(0, 60),
        text: t,
      };
      const list = [tpl, ...prev].slice(0, 100);
      saveTemplates(list);
      return list;
    });
  }, []);

  const removeTemplate = useCallback((id: string) => {
    setTemplates((prev) => {
      const list = prev.filter((t) => t.id !== id);
      saveTemplates(list);
      return list;
    });
  }, []);

  const createProject = useCallback((name: string) => {
    setProjects((prev) => {
      const list = [{ id: newId(), name, createdAt: Date.now() }, ...prev];
      saveProjects(list);
      return list;
    });
  }, []);

  const renameProject = useCallback((id: string, name: string) => {
    setProjects((prev) => {
      const list = prev.map((p) => (p.id === id ? { ...p, name } : p));
      saveProjects(list);
      return list;
    });
  }, []);

  const setProjectInstructions = useCallback((id: string, text: string) => {
    setProjects((prev) => {
      const list = prev.map((p) =>
        p.id === id ? { ...p, instructions: text } : p
      );
      saveProjects(list);
      return list;
    });
  }, []);

  const deleteProject = useCallback(
    (id: string) => {
      setProjects((prev) => {
        const list = prev.filter((p) => p.id !== id);
        saveProjects(list);
        return list;
      });
      // Un-group the project's chats rather than deleting them.
      setConversations((prev) => {
        const list = prev.map((c) =>
          c.projectId === id ? { ...c, projectId: undefined } : c
        );
        saveConversations(list);
        return list;
      });
      if (activeProjectId === id) {
        setActiveProjectId(null);
        saveActiveProject(null);
      }
    },
    [activeProjectId]
  );

  const selectProject = useCallback((id: string | null) => {
    setActiveProjectId(id);
    saveActiveProject(id);
    setProjectsOpen(false);
    if (id) {
      const inProject = conversationsRef.current.filter(
        (c) => c.projectId === id
      );
      if (inProject.length > 0) {
        setActiveId(inProject[0].id);
        saveActive(inProject[0].id);
      } else {
        const nid = newId();
        setConversations((prev) => {
          const list = [
            {
              id: nid,
              title: "New chat",
              updatedAt: Date.now(),
              projectId: id,
            },
            ...prev,
          ];
          saveConversations(list);
          return list;
        });
        setActiveId(nid);
        saveActive(nid);
      }
    }
  }, []);

  // Persist messages and keep the conversation title/order in sync.
  const handleMessages = useCallback((id: string, messages: UIMessage[]) => {
    saveMessages(id, messages);
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      const current = prev[idx];
      if (current.renamed) {
        cloudSave(current, messages);
        return prev;
      }
      const nextTitle = titleFromMessages(messages);
      // Only touch state when the derived title actually changes (once, when
      // the first user message arrives) — never on every streamed token.
      if (!nextTitle || nextTitle === current.title) {
        cloudSave(current, messages);
        return prev;
      }
      const list = [...prev];
      list[idx] = { ...current, title: nextTitle, updatedAt: Date.now() };
      saveConversations(list);
      cloudSave(list[idx], messages);
      return list;
    });
  }, []);

  if (!ready) return null;

  const activeConvo = conversations.find((c) => c.id === activeId);
  const activeInstructions = activeConvo?.instructions ?? "";
  const activeProject = activeProjectId
    ? (projects.find((p) => p.id === activeProjectId) ?? null)
    : null;
  const projectForActiveChat = activeConvo?.projectId
    ? projects.find((p) => p.id === activeConvo.projectId)
    : undefined;
  const projectInstructions = projectForActiveChat?.instructions ?? "";
  const visibleConversations = activeProjectId
    ? conversations.filter((c) => c.projectId === activeProjectId)
    : conversations;

  return (
    <div className={`layout ${collapsed ? "collapsed" : ""}`}>
      <Sidebar
        conversations={visibleConversations}
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
        bookmarks={bookmarks}
        templates={templates}
        onSelectBookmark={selectChat}
        onRemoveBookmark={removeBookmark}
        onInsertTemplate={useTool}
        onRemoveTemplate={removeTemplate}
        onOpenArtifacts={() => setArtifactsOpen(true)}
        onOpenProjects={() => setProjectsOpen(true)}
        activeProjectName={activeProject?.name ?? null}
        onExitProject={() => selectProject(null)}
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
        instructions={activeInstructions}
        onSetInstructions={changeInstructions}
        projectInstructions={projectInstructions}
        templates={templates}
        onSaveTemplate={saveTemplate}
        onBookmark={addBookmark}
        prefill={prefill}
        onMessages={handleMessages}
        onToggleSidebar={() => setCollapsed((v) => !v)}
      />
      {artifactsOpen && (
        <ArtifactsPanel
          conversationId={activeId}
          onClose={() => setArtifactsOpen(false)}
        />
      )}
      {projectsOpen && (
        <ProjectsModal
          projects={projects}
          activeProjectId={activeProjectId}
          conversations={conversations}
          onClose={() => setProjectsOpen(false)}
          onCreate={createProject}
          onRename={renameProject}
          onDelete={deleteProject}
          onSetInstructions={setProjectInstructions}
          onSelect={selectProject}
        />
      )}
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
