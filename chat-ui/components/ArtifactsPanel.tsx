"use client";

import { useEffect, useState } from "react";
import { loadMessages } from "@/lib/storage";
import {
  extractArtifacts,
  artifactFileName,
  type Artifact,
} from "@/lib/artifacts";
import { downloadFile } from "@/lib/transfer";

/**
 * Right-side drawer that lists the artifacts (code / doc / table blocks) the
 * assistant produced in the active conversation, with copy + download.
 */
export default function ArtifactsPanel({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refresh = () =>
    setArtifacts(extractArtifacts(loadMessages(conversationId)));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async (a: Artifact) => {
    try {
      await navigator.clipboard.writeText(a.content);
      setCopiedId(a.id);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="artifacts-overlay" onClick={onClose}>
      <aside className="artifacts-panel" onClick={(e) => e.stopPropagation()}>
        <div className="artifacts-head">
          <span className="artifacts-title">
            Artifacts{artifacts.length > 0 ? ` (${artifacts.length})` : ""}
          </span>
          <div className="artifacts-head-actions">
            <button
              type="button"
              className="msg-action"
              onClick={refresh}
              title="Refresh"
            >
              Refresh
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Close artifacts"
              title="Close"
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
        </div>

        {artifacts.length === 0 ? (
          <div className="artifacts-empty">
            No artifacts yet. Code, documents, and tables the assistant
            generates in this chat will appear here.
          </div>
        ) : (
          <div className="artifacts-list">
            {artifacts.map((a) => (
              <div key={a.id} className="artifact-card">
                <div className="artifact-card-head">
                  <span className="artifact-lang">{a.lang}</span>
                  <span className="artifact-meta">{a.lines} lines</span>
                  <div className="artifact-actions">
                    <button
                      type="button"
                      className="msg-action"
                      onClick={() => copy(a)}
                    >
                      {copiedId === a.id ? "Copied ✓" : "Copy"}
                    </button>
                    <button
                      type="button"
                      className="msg-action"
                      onClick={() =>
                        downloadFile(
                          artifactFileName(a),
                          a.content,
                          "text/plain"
                        )
                      }
                    >
                      Download
                    </button>
                  </div>
                </div>
                <pre className="artifact-code">
                  {a.content.length > 4000
                    ? `${a.content.slice(0, 4000)}\n…`
                    : a.content}
                </pre>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
