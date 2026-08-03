"use client";

import { useEffect } from "react";

const SHORTCUTS: [string, string][] = [
  ["⌘/Ctrl + K", "Open the command palette"],
  ["Enter", "Send message"],
  ["Shift + Enter", "New line in the composer"],
  ["?", "Show this shortcuts help"],
  ["Esc", "Close dialogs / overlays"],
  ["Double-click a chat", "Rename it"],
  ["⌘/Ctrl + Enter", "Run the orchestrator plan"],
];

export default function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="shortcuts-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <div className="projects-modal-head">
          <span className="projects-modal-title">Keyboard shortcuts</span>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close shortcuts"
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
        <ul className="shortcuts-list">
          {SHORTCUTS.map(([keys, desc]) => (
            <li key={keys}>
              <kbd>{keys}</kbd>
              <span>{desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
