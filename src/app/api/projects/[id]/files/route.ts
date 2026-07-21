// File operations for a project's virtual file system:
// PUT    /api/projects/[id]/files            — upsert (manual edit)
// DELETE /api/projects/[id]/files?path=...   — delete a file
// PATCH  /api/projects/[id]/files?path=...   — rename a file (body: { newPath })

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";

// GET — friendly info message (prevents 405 in terminal on prefetch/direct nav)
export async function GET() {
  return NextResponse.json({
    error: "Use PUT to upsert, DELETE ?path=... to remove, or PATCH ?path=... to rename.",
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const path = (body.path as string)?.trim();
  const content = (body.content as string) ?? "";
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const existing = await db.projectFile.findUnique({
    where: { projectId_path: { projectId: id, path } },
  });
  let file;
  if (existing) {
    file = await db.projectFile.update({
      where: { id: existing.id },
      data: {
        content,
        version: existing.version + 1,
        lastAction: "modified",
        updatedAt: new Date(),
      },
    });
  } else {
    file = await db.projectFile.create({
      data: { projectId: id, path, content, version: 1, lastAction: "added" },
    });
  }
  await db.project.update({
    where: { id },
    data: { status: project.status === "empty" ? "idle" : project.status },
  });
  return NextResponse.json({
    file: {
      id: file.id,
      path: file.path,
      content: file.content,
      version: file.version,
      lastAction: file.lastAction,
      updatedAt: file.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const existing = await db.projectFile.findUnique({
    where: { projectId_path: { projectId: id, path } },
  });
  if (!existing) return NextResponse.json({ error: "File not found" }, { status: 404 });

  await db.projectFile.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}

// PATCH /api/projects/[id]/files?path=...  — rename a file
//   body: { newPath }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const oldPath = url.searchParams.get("path");
  if (!oldPath) return NextResponse.json({ error: "path required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const newPath = (body.newPath as string)?.trim();
  if (!newPath) return NextResponse.json({ error: "newPath required" }, { status: 400 });

  const existing = await db.projectFile.findUnique({
    where: { projectId_path: { projectId: id, path: oldPath } },
  });
  if (!existing) return NextResponse.json({ error: "File not found" }, { status: 404 });

  // Check if newPath already exists.
  const conflict = await db.projectFile.findUnique({
    where: { projectId_path: { projectId: id, path: newPath } },
  });
  if (conflict) return NextResponse.json({ error: "A file with that path already exists" }, { status: 409 });

  const updated = await db.projectFile.update({
    where: { id: existing.id },
    data: { path: newPath, updatedAt: new Date() },
  });

  return NextResponse.json({
    file: {
      id: updated.id,
      path: updated.path,
      content: updated.content,
      version: updated.version,
      lastAction: updated.lastAction,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
