"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation, Project } from "@/lib/storage";

/**
 * Modal to manage projects: create, rename, delete, edit shared instructions,
 * and open a project (which filters the sidebar to that project's chats). A
 * project's instructions are prepended to every chat in it.
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
}) {
  const [name, setName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
              }`}
            >
              <div className="project-row">
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
