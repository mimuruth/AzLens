/**
 * Projects API (Cosmos DB-backed, same container as conversations).
 *   GET    /api/projects        -> { enabled, projects: meta[] }
 *   POST   /api/projects        -> upsert { project }
 *   DELETE /api/projects?id=<id> -> delete one project
 * When Cosmos is not configured, GET reports enabled:false and writes no-op.
 */
export const runtime = "nodejs";

import {
  historyEnabled,
  userIdFromHeaders,
  listProjects,
  upsertProject,
  deleteProject,
  type ProjectMeta,
} from "@/lib/history";

export async function GET(req: Request): Promise<Response> {
  if (!historyEnabled()) {
    return Response.json({ enabled: false, projects: [] });
  }
  const userId = userIdFromHeaders(new Headers(req.headers));
  try {
    const projects = await listProjects(userId);
    return Response.json({ enabled: true, projects });
  } catch (err) {
    console.warn("projects GET failed:", err);
    return Response.json({ enabled: false, projects: [] });
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!historyEnabled()) return Response.json({ ok: false, enabled: false });
  const userId = userIdFromHeaders(new Headers(req.headers));
  const body = await req.json().catch(() => null);
  const project = body?.project as ProjectMeta | undefined;
  if (!project?.id || !project.name) {
    return new Response("Missing project.id / project.name", { status: 400 });
  }
  try {
    await upsertProject(userId, project);
    return Response.json({ ok: true });
  } catch (err) {
    console.warn("projects POST failed:", err);
    return Response.json({ ok: false });
  }
}

export async function DELETE(req: Request): Promise<Response> {
  if (!historyEnabled()) return Response.json({ ok: false, enabled: false });
  const userId = userIdFromHeaders(new Headers(req.headers));
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new Response("Missing id", { status: 400 });
  try {
    await deleteProject(userId, id);
    return Response.json({ ok: true });
  } catch (err) {
    console.warn("projects DELETE failed:", err);
    return Response.json({ ok: false });
  }
}
