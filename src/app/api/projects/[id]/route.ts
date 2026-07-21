// GET    /api/projects/[id]   — full project (config, files, messages)
// PATCH  /api/projects/[id]   — rename / update model config / description
// DELETE /api/projects/[id]   — delete project and all its scoped data

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { jobManager } from "@/lib/job-manager";
import type { ModelConfig, ProjectFile, ChatMessage, MessageMeta } from "@/lib/types";

function assertOwned(project: { userId: string }, userId: string) {
  if (project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const owned = assertOwned(project, user.id);
  if (owned) return owned;

  const [files, messages] = await Promise.all([
    db.projectFile.findMany({ where: { projectId: id }, orderBy: { path: "asc" } }),
    db.projectMessage.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
  ]);

  // Detect an in-flight generation so the client can reattach.
  const activeJobId = jobManager.getActiveJobForProject(id);
  let activeJob = null;
  if (activeJobId) {
    const j = await db.generationJob.findUnique({ where: { id: activeJobId } });
    if (j && j.status === "running") {
      activeJob = {
        id: j.id,
        status: j.status,
        prompt: j.prompt,
        tokensUsed: j.tokensUsed,
        filesCompleted: j.filesCompleted,
        startedAt: j.startedAt.toISOString(),
      };
    }
  }

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      modelConfig: JSON.parse(project.modelConfig),
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    },
    files: files.map<ProjectFile>((f) => ({
      id: f.id,
      path: f.path,
      content: f.content,
      version: f.version,
      lastAction: f.lastAction as ProjectFile["lastAction"],
      updatedAt: f.updatedAt.toISOString(),
    })),
    messages: messages.map<ChatMessage>((m) => ({
      id: m.id,
      role: m.role as ChatMessage["role"],
      content: m.content,
      meta: safeParseMeta(m.meta),
      tokens: m.tokens,
      createdAt: m.createdAt.toISOString(),
    })),
    activeJob,
  });
}

function safeParseMeta(s: string): MessageMeta {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const owned = assertOwned(project, user.id);
  if (owned) return owned;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.description === "string") data.description = body.description.trim();
  if (body.modelConfig && typeof body.modelConfig === "object") {
    const merged = { ...JSON.parse(project.modelConfig), ...body.modelConfig } as ModelConfig;
    data.modelConfig = JSON.stringify(merged);
  }

  const updated = await db.project.update({ where: { id }, data });
  return NextResponse.json({
    project: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      status: updated.status,
      modelConfig: JSON.parse(updated.modelConfig),
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const owned = assertOwned(project, user.id);
  if (owned) return owned;

  // Cancel any in-flight job first.
  const activeJobId = jobManager.getActiveJobForProject(id);
  if (activeJobId) await jobManager.cancel(activeJobId);

  // Cascade delete handles files, messages, jobs.
  await db.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
