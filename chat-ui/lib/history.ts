import "server-only";
import type { UIMessage } from "ai";
import { cosmosConfigured, getContainer } from "./cosmos";

/**
 * Server-side conversation history backed by Cosmos DB. One document per
 * conversation, partitioned by userId. Metadata mirrors the client's
 * Conversation type; the full message list is stored alongside it.
 */
export type StoredConversation = {
  id: string;
  userId: string;
  title: string;
  updatedAt: number;
  renamed?: boolean;
  pinned?: boolean;
  agentId?: string;
  model?: { provider: string; model: string };
  messages?: UIMessage[];
};

export type ConversationMeta = Omit<StoredConversation, "userId" | "messages">;

export function historyEnabled(): boolean {
  return cosmosConfigured();
}

/**
 * Resolve the current user from Easy Auth headers (injected by Azure Container
 * Apps when Entra sign-in is on). Falls back to a shared "local" partition for
 * unauthenticated / local development.
 */
export function userIdFromHeaders(headers: Headers): string {
  return (
    headers.get("x-ms-client-principal-id") ||
    headers.get("x-ms-client-principal-name") ||
    "local"
  );
}

export async function listConversations(
  userId: string
): Promise<ConversationMeta[]> {
  const container = await getContainer();
  if (!container) return [];
  const { resources } = await container.items
    .query<ConversationMeta>({
      query:
        "SELECT c.id, c.title, c.updatedAt, c.renamed, c.pinned, c.agentId, c.model, c.projectId " +
        "FROM c WHERE c.userId = @u AND NOT IS_DEFINED(c.docType) " +
        "ORDER BY c.updatedAt DESC",
      parameters: [{ name: "@u", value: userId }],
    })
    .fetchAll();
  return resources;
}

export async function getConversation(
  userId: string,
  id: string
): Promise<StoredConversation | null> {
  const container = await getContainer();
  if (!container) return null;
  try {
    const { resource } = await container
      .item(id, userId)
      .read<StoredConversation>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function upsertConversation(
  userId: string,
  conversation: Omit<StoredConversation, "userId" | "messages">,
  messages: UIMessage[]
): Promise<void> {
  const container = await getContainer();
  if (!container) return;
  const doc: StoredConversation = {
    ...conversation,
    userId,
    messages: messages ?? [],
    updatedAt: conversation.updatedAt ?? Date.now(),
  };
  await container.items.upsert(doc);
}

export async function deleteConversation(
  userId: string,
  id: string
): Promise<void> {
  const container = await getContainer();
  if (!container) return;
  try {
    await container.item(id, userId).delete();
  } catch {
    /* already gone */
  }
}

// ---- Projects (stored in the same container, tagged docType='project') ------

export type ProjectFile = {
  id: string;
  name: string;
  size: number;
  content: string;
};

export type StoredProject = {
  id: string;
  userId: string;
  docType: "project";
  name: string;
  instructions?: string;
  createdAt: number;
  order?: number;
  files?: ProjectFile[];
};

export type ProjectMeta = Omit<StoredProject, "userId" | "docType">;

export async function listProjects(userId: string): Promise<ProjectMeta[]> {
  const container = await getContainer();
  if (!container) return [];
  const { resources } = await container.items
    .query<ProjectMeta>({
      query:
        'SELECT c.id, c.name, c.instructions, c.createdAt, c["order"], c.files ' +
        "FROM c WHERE c.userId = @u AND c.docType = 'project' ORDER BY c.createdAt DESC",
      parameters: [{ name: "@u", value: userId }],
    })
    .fetchAll();
  return resources;
}

export async function upsertProject(
  userId: string,
  project: ProjectMeta
): Promise<void> {
  const container = await getContainer();
  if (!container) return;
  const doc: StoredProject = { ...project, userId, docType: "project" };
  await container.items.upsert(doc);
}

export async function deleteProject(userId: string, id: string): Promise<void> {
  const container = await getContainer();
  if (!container) return;
  try {
    await container.item(id, userId).delete();
  } catch {
    /* already gone */
  }
}

// ---- Message feedback (same container, docType='feedback') ------------------

export type StoredFeedback = {
  id: string;
  userId: string;
  docType: "feedback";
  convoId: string;
  messageId: string;
  rating: "up" | "down";
  reason?: string;
  createdAt: number;
};

export async function upsertFeedback(
  userId: string,
  fb: Omit<StoredFeedback, "userId" | "docType" | "id" | "createdAt">
): Promise<void> {
  const container = await getContainer();
  if (!container) return;
  const doc: StoredFeedback = {
    ...fb,
    id: `fb:${fb.messageId}`,
    userId,
    docType: "feedback",
    createdAt: Date.now(),
  };
  await container.items.upsert(doc);
}
