"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type Conversation,
  type Theme,
  type Bookmark,
  type PromptTemplate,
  type Project,
  groupByDate,
} from "@/lib/storage";
import Logo from "@/components/Logo";
import ProfileChip from "@/components/ProfileChip";

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

const AGENT_GUIDE_PROMPT =
  "Give me a guide to the available AI agents (General, Code Assistant, Azure Expert, Personal Assistant, GitHub, FinOps, Research, Data Analyst): what each one is best for, and which MCP tools it can use.";

/** Left-menu feature shortcuts (Kimi-style). Clicking drafts a starter prompt
 * and, for the mode features, activates the matching composer mode chip. */
const FEATURE_ITEMS: {
  id: string;
  label: string;
  prompt: string;
  mode?: string;
}[] = [
  {
    id: "plugin",
    label: "Plugin",
    prompt: "What MCP tools and plugins are available, and what can each do?",
  },
  {
    id: "scheduled",
    label: "Scheduled Tasks",
    prompt: "Show my scheduled tasks and to-do list.",
  },
  {
    id: "swarm",
    label: "Swarm",
    prompt:
      "Use Swarm mode — reason in multiple passes, then synthesise. Topic: ",
    mode: "swarm",
  },
  {
    id: "slide",
    label: "Slide",
    prompt: "Create a slide-deck outline for: ",
    mode: "slide",
  },
  {
    id: "deep-research",
    label: "Deep Research",
    prompt: "Do deep research (use tools, cite sources) on: ",
    mode: "deep-research",
  },
  {
    id: "websites",
    label: "Websites",
    prompt: "Find and summarise websites about: ",
    mode: "websites",
  },
  {
    id: "docs",
    label: "Docs",
    prompt: "Write a well-structured document about: ",
    mode: "docs",
  },
  {
    id: "sheets",
    label: "Sheets",
    prompt: "Create a spreadsheet table (Markdown/CSV) of: ",
    mode: "sheets",
  },
];

/** Small icon for each left-menu feature (visually similar to Kimi's set). */
function FeatureIcon({ id }: { id: string }) {
  const p = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (id) {
    case "plugin":
      return (
        <svg {...p}>
          <path d="M9 3v4M15 3v4M7 7h10v4a5 5 0 01-10 0V7zM12 16v5" />
        </svg>
      );
    case "scheduled":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </svg>
      );
    case "swarm":
      return (
        <svg {...p}>
          <path d="M12 3l1.4 4.2L18 8l-4.6 1.4L12 14l-1.4-4.6L6 8l4.6-.8z" />
          <circle cx="18" cy="17" r="2" />
          <circle cx="6.5" cy="16.5" r="1.5" />
        </svg>
      );
    case "slide":
      return (
        <svg {...p}>
          <rect x="4" y="5" width="16" height="12" rx="2" />
          <path d="M4 9h16M12 17v3" />
        </svg>
      );
    case "deep-research":
      return (
        <svg {...p}>
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4-4" />
        </svg>
      );
    case "websites":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4c2.6 2.4 2.6 13.2 0 16M12 4c-2.6 2.4-2.6 13.2 0 16" />
        </svg>
      );
    case "docs":
      return (
        <svg {...p}>
          <path d="M7 3h7l5 5v13H7z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </svg>
      );
    case "sheets":
      return (
        <svg {...p}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M4 10h16M4 15h16M10 4v16" />
        </svg>
      );
    default:
      return null;
  }
}

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
  onOpenArtifacts,
  onOpenProjects,
  onOpenOrchestrator,
  projects,
  activeProjectId,
  onSelectProject,
  onAssignChatToProject,
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
  onUseTool: (prompt: string, mode?: string | null) => void;
  onClearAll: () => void;
  onToggleTheme: () => void;
  bookmarks: Bookmark[];
  templates: PromptTemplate[];
  onSelectBookmark: (convoId: string) => void;
  onRemoveBookmark: (id: string) => void;
  onInsertTemplate: (text: string) => void;
  onRemoveTemplate: (id: string) => void;
  onOpenArtifacts: () => void;
  onOpenProjects: () => void;
  onOpenOrchestrator: () => void;
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onAssignChatToProject: (chatId: string, projectId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [toolsOpen, setToolsOpen] = useState(true);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [servers, setServers] = useState<ServerHealth[]>([]);
  const [libOpen, setLibOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(true);
  const [projectsPanelOpen, setProjectsPanelOpen] = useState(true);
  // Directional fade affordance: only fade the edge that has more content.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop > 4;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
    setEdges((p) =>
      p.top === top && p.bottom === bottom ? p : { top, bottom }
    );
  }, []);
  const activeProjectName = activeProjectId
    ? (projects.find((p) => p.id === activeProjectId)?.name ?? null)
    : null;
  const [library, setLibrary] = useState<{
    prompts: LibraryPrompt[];
    resources: LibraryResource[];
  }>({ prompts: [], resources: [] });

  // Recompute fade edges on scroll, resize, and whenever content height may
  // have changed (panels toggling, list updates re-run this after render).
  useLayoutEffect(() => {
    updateEdges();
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateEdges, { passive: true });
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      ro.disconnect();
    };
  }, [updateEdges]);

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
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
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
        {(() => {
          const proj = c.projectId
            ? projects.find((p) => p.id === c.projectId)
            : undefined;
          if (!proj?.instructions) return null;
          return (
            <span
              className="chat-instr-dot"
              title={`Uses project instructions from “${proj.name}”`}
              aria-label="Uses project instructions"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 6h16M4 12h16M4 18h10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          );
        })()}
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

        <div
          className={`sidebar-scroll${edges.top ? " fade-top" : ""}${
            edges.bottom ? " fade-bottom" : ""
          }`}
          ref={scrollRef}
        >
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

          <div className="tools-panel projects-panel">
            <div className="projects-head-row">
              <button
                className="tools-head projects-toggle"
                onClick={() => setProjectsPanelOpen((v) => !v)}
                aria-expanded={projectsPanelOpen}
              >
                <span>Projects</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  className={projectsPanelOpen ? "chev open" : "chev"}
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
              <button
                type="button"
                className="projects-manage"
                onClick={onOpenProjects}
                title="Manage projects"
              >
                Manage
              </button>
            </div>
            {projectsPanelOpen && (
              <div className="tools-list">
                <button
                  type="button"
                  className={`project-nav ${activeProjectId === null ? "active" : ""}`}
                  onClick={() => onSelectProject(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData("text/plain");
                    if (id) onAssignChatToProject(id, null);
                  }}
                >
                  <span className="project-nav-icon">☰</span>
                  <span className="project-nav-name">All chats</span>
                </button>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`project-nav ${activeProjectId === p.id ? "active" : ""}`}
                    onClick={() => onSelectProject(p.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData("text/plain");
                      if (id) onAssignChatToProject(id, p.id);
                    }}
                    title={`${p.name} — drop a chat here to add it`}
                  >
                    <span className="project-nav-icon">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="project-nav-name">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="side-entry"
            onClick={onOpenArtifacts}
            title="Artifacts"
          >
            <span className="side-entry-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3l9 5-9 5-9-5 9-5z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 13l9 5 9-5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Artifacts
          </button>

          <button
            className="side-entry"
            onClick={onOpenOrchestrator}
            title="Orchestrator — plan and delegate across agents"
          >
            <span className="side-entry-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="5"
                  r="2.4"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <circle
                  cx="5"
                  cy="18"
                  r="2.4"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <circle
                  cx="19"
                  cy="18"
                  r="2.4"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path
                  d="M12 7.4V12M12 12l-5.2 3.8M12 12l5.2 3.8"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            Orchestrator
          </button>

          <button
            className="side-entry"
            onClick={() => onUseTool(AGENT_GUIDE_PROMPT)}
            title="AI Agent Guide"
          >
            <span className="side-entry-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 4h11a2 2 0 012 2v14H7a2 2 0 01-2-2V4z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 8h6M9 12h6"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            AI Agent Guide
          </button>

          <div className="tools-panel features-panel">
            <button
              className="tools-head"
              onClick={() => setFeaturesOpen((v) => !v)}
              aria-expanded={featuresOpen}
            >
              <span>Features</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                className={featuresOpen ? "chev open" : "chev"}
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
            {featuresOpen && (
              <div className="tools-list">
                {FEATURE_ITEMS.map((f) => (
                  <button
                    key={f.id}
                    className="feature-item"
                    onClick={() => onUseTool(f.prompt, f.mode ?? null)}
                    title={f.label}
                  >
                    <span className="feature-icon">
                      <FeatureIcon id={f.id} />
                    </span>
                    <span className="feature-label">{f.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

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

          {activeProjectName && (
            <div className="project-banner">
              <span className="project-banner-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="project-banner-name">{activeProjectName}</span>
              <button
                type="button"
                className="project-banner-exit"
                onClick={() => onSelectProject(null)}
                title="Exit project"
                aria-label="Exit project"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          )}

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
              <span className="tools-head-title">
                MCP tools
                {servers.length > 0 && (
                  <span
                    className={`tools-count${
                      servers.every((s) => s.ok) ? " ok" : ""
                    }`}
                    title={`${servers.filter((s) => s.ok).length} of ${
                      servers.length
                    } tools online`}
                  >
                    {servers.filter((s) => s.ok).length}
                  </span>
                )}
              </span>
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
                {servers.length === 0 && (
                  <p className="empty-list">Checking…</p>
                )}
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
                  {bookmarks.length > 0 && (
                    <p className="lib-label">Bookmarks</p>
                  )}
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
        </div>

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
          <ProfileChip />
          <p className="credit">Developed by Michael M</p>
        </div>
      </div>
    </aside>
  );
}
