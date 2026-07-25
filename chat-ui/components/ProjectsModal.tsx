"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation, Project, ProjectFile } from "@/lib/storage";

/**
 * Modal to manage projects: create, rename, delete, edit shared instructions,
 * upload grounding files, reorder (drag or arrows), and open a project (which
 * filters the sidebar to that project's chats). A project's instructions and
 * files are prepended to every chat in it.
 */
export default function ProjectsModal({
  projects,
  activeProjectId,
  conversations,
  onClose,
  onCreate,
  onRename,
  onDelete,
  onSetInstructions,
  onSelect,
  onMoveProject,
  onReorderProjects,
  onAddFile,
  onRemoveFile,
  onIngest,
  onCreateIndex,
  fileMax,
}: {
  projects: Project[];
  activeProjectId: string | null;
  conversations: Conversation[];
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onSetInstructions: (id: string, text: string) => void;
  onSelect: (id: string | null) => void;
  onMoveProject: (id: string, dir: "up" | "down") => void;
  onReorderProjects: (fromId: string, toId: string) => void;
  onAddFile: (id: string, file: ProjectFile) => void;
  onRemoveFile: (id: string, fileId: string) => void;
  onIngest: (project: Project) => Promise<string>;
  onCreateIndex: () => Promise<string>;
  fileMax: number;
}) {
  const [name, setName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filesId, setFilesId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [ingestId, setIngestId] = useState<string | null>(null);
  const [ingestMsg, setIngestMsg] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const countFor = (id: string) =>
    conversations.filter((c) => c.projectId === id).length;

  const create = () => {
    const n = name.trim();
    if (!n) return;
    onCreate(n);
    setName("");
  };

  const expand = (p: Project) => {
    if (expandedId === p.id) {
      setExpandedId(null);
    } else {
      setExpandedId(p.id);
      setDraft(p.instructions ?? "");
    }
  };

  const pickFiles = (projectId: string) => {
    uploadTarget.current = projectId;
    fileInputRef.current?.click();
  };

  const genId = () =>
    "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const onFilesChosen = async (list: FileList | null) => {
    const projectId = uploadTarget.current;
    if (!projectId || !list) return;
    for (const file of Array.from(list)) {
      const raw = await file.text();
      const content = raw.length > fileMax ? raw.slice(0, fileMax) : raw;
      onAddFile(projectId, {
        id: genId(),
        name: file.name,
        size: file.size,
        content,
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const ingest = async (p: Project) => {
    setIngestId(p.id);
    setIngestMsg((m) => ({ ...m, [p.id]: "Ingesting\u2026" }));
    try {
      const msg = await onIngest(p);
      setIngestMsg((m) => ({ ...m, [p.id]: msg }));
    } catch (err) {
      setIngestMsg((m) => ({
        ...m,
        [p.id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setIngestId(null);
    }
  };

  const createIndex = async (p: Project) => {
    setIngestId(p.id);
    setIngestMsg((m) => ({ ...m, [p.id]: "Creating index\u2026" }));
    try {
      const msg = await onCreateIndex();
      setIngestMsg((m) => ({ ...m, [p.id]: msg }));
    } catch (err) {
      setIngestMsg((m) => ({
        ...m,
        [p.id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setIngestId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="projects-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Projects"
      >
        <div className="projects-modal-head">
          <span className="projects-modal-title">Projects</span>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close projects"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="projects-new">
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="New project name…"
          />
          <button type="button" className="btn-primary" onClick={create}>
            Create
          </button>
        </div>

        <button
          type="button"
          className={`project-row all-chats ${
            activeProjectId === null ? "active" : ""
          }`}
          onClick={() => onSelect(null)}
        >
          <span className="project-name">All chats</span>
          <span className="project-count">{conversations.length}</span>
        </button>

        <div className="projects-list">
          {projects.length === 0 && (
            <p className="projects-empty">
              No projects yet. Create one to group related chats and give them
              shared instructions.
            </p>
          )}
          {projects.map((p, i) => (
            <div
              key={p.id}
              className={`project-item ${
                activeProjectId === p.id ? "active" : ""
              } ${dragId === p.id ? "dragging" : ""} ${
                dropId === p.id ? "drop-target" : ""
              }`}
              draggable
              onDragStart={(e) => {
                setDragId(p.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragId && dragId !== p.id) {
                  e.preventDefault();
                  setDropId(p.id);
                }
              }}
              onDragLeave={() => setDropId((d) => (d === p.id ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragId !== p.id) onReorderProjects(dragId, p.id);
                setDragId(null);
                setDropId(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropId(null);
              }}
            >
              <div className="project-row">
                <span className="project-drag-handle" title="Drag to reorder">
                  ⠿
                </span>
                <button
                  type="button"
                  className="project-open"
                  onClick={() => onSelect(p.id)}
                  title="Open project"
                >
                  <span className="project-name">{p.name}</span>
                  <span className="project-count">{countFor(p.id)}</span>
                </button>
                <div className="project-actions">
                  <button
                    type="button"
                    className="msg-action"
                    disabled={i === 0}
                    onClick={() => onMoveProject(p.id, "up")}
                    title="Move up"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="msg-action"
                    disabled={i === projects.length - 1}
                    onClick={() => onMoveProject(p.id, "down")}
                    title="Move down"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="msg-action"
                    onClick={() => {
                      const next = window.prompt("Rename project:", p.name);
                      if (next && next.trim()) onRename(p.id, next.trim());
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="msg-action"
                    onClick={() => expand(p)}
                  >
                    Instructions
                  </button>
                  <button
                    type="button"
                    className="msg-action"
                    onClick={() =>
                      setFilesId((v) => (v === p.id ? null : p.id))
                    }
                  >
                    Files{p.files?.length ? ` (${p.files.length})` : ""}
                  </button>
                  <button
                    type="button"
                    className="msg-action danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete project "${p.name}"? Its chats are kept but un-grouped.`
                        )
                      )
                        onDelete(p.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {expandedId === p.id && (
                <div className="project-instr">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    placeholder="Shared instructions for every chat in this project…"
                  />
                  <div className="project-instr-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        onSetInstructions(p.id, draft.trim());
                        setExpandedId(null);
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setExpandedId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {filesId === p.id && (
                <div className="project-files">
                  <div className="project-files-head">
                    <span className="project-files-hint">
                      Text files added here ground every chat in this project.
                    </span>
                    <div className="project-files-head-actions">
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={ingestId === p.id}
                        onClick={() => createIndex(p)}
                        title="Create the Azure AI Search index (first-time setup)"
                      >
                        Create index
                      </button>
                      {p.files && p.files.length > 0 && (
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={ingestId === p.id}
                          onClick={() => ingest(p)}
                          title="Push these files to the Azure AI Search index (mcp-knowledge)"
                        >
                          {ingestId === p.id
                            ? "Ingesting\u2026"
                            : "Ingest to knowledge base"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => pickFiles(p.id)}
                      >
                        Add files
                      </button>
                    </div>
                  </div>
                  {ingestMsg[p.id] && (
                    <p className="project-files-status">{ingestMsg[p.id]}</p>
                  )}
                  {p.files && p.files.length > 0 ? (
                    <ul className="project-files-list">
                      {p.files.map((f) => (
                        <li key={f.id} className="project-file">
                          <span className="project-file-name" title={f.name}>
                            {f.name}
                          </span>
                          <span className="project-file-size">
                            {Math.max(1, Math.round(f.content.length / 1024))}{" "}
                            KB
                          </span>
                          <button
                            type="button"
                            className="msg-action danger"
                            onClick={() => onRemoveFile(p.id, f.id)}
                            aria-label={`Remove ${f.name}`}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="project-files-empty">No files yet.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        accept=".txt,.md,.markdown,.json,.csv,.tsv,.ts,.tsx,.js,.jsx,.py,.yaml,.yml,.html,.css,.sql,.xml,.log,text/*"
        onChange={(e) => onFilesChosen(e.target.files)}
      />
    </div>
  );
}
