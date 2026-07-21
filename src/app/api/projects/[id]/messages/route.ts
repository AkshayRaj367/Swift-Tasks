// POST /api/projects/[id]/messages
//   body: { role, content, meta?, tokens? }
//   Persists a chat message for a project (used by client-side generation).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const role = (body.role as string)?.trim();
  const content = (body.content as string) ?? "";
  const meta = (body.meta as string) ?? "{}";
  const tokens = (body.tokens as number) ?? 0;

  if (!role) return NextResponse.json({ error: "role required" }, { status: 400 });

  // Also persist the user message if it's not already there.
  if (role === "user") {
    const existing = await db.projectMessage.findFirst({
      where: { projectId: id, role: "user", content },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    if (existing) return NextResponse.json({ ok: true, id: existing.id });
  }

  const message = await db.projectMessage.create({
    data: { projectId: id, role, content, meta, tokens },
  });

  // Touch project updatedAt.
  await db.project.update({
    where: { id },
    data: { status: role === "assistant" ? "idle" : project.status },
  });

  return NextResponse.json({ ok: true, id: message.id });
}

// GET — friendly info message (prevents 405)
export async function GET() {
  return NextResponse.json({
    error: "This endpoint requires a POST request with { role, content, meta?, tokens? }.",
  });
}
