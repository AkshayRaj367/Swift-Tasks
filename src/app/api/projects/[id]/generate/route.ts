// POST /api/projects/[id]/generate
//   body: { prompt, history? }
//   Starts a detached generation job. Returns the job record + jobId.
//   The client then connects to /api/projects/[id]/generate/stream?jobId=X
//   to tail the SSE event stream.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { jobManager } from "@/lib/job-manager";
import type { ModelConfig } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const prompt = (body.prompt as string)?.trim();
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  const config: ModelConfig = JSON.parse(project.modelConfig);

  // Build conversation history from stored messages (scoped to this project).
  const dbMessages = await db.projectMessage.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
    take: 20, // keep context bounded
  });
  const history = dbMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  try {
    const job = await jobManager.startJob({
      projectId: id,
      prompt,
      config,
      history,
    });
    return NextResponse.json({ job });
  } catch (err) {
    const e = err as { message?: string; code?: string };
    return NextResponse.json(
      { error: e.message || "Failed to start generation", code: e.code },
      { status: e.code === "ALREADY_RUNNING" ? 409 : 500 }
    );
  }
}
