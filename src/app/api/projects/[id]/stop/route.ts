// POST /api/projects/[id]/stop   — cancel the active generation for a project
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { jobManager } from "@/lib/job-manager";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const activeJobId = jobManager.getActiveJobForProject(id);
  if (!activeJobId) return NextResponse.json({ ok: true, message: "no active job" });
  await jobManager.cancel(activeJobId);
  return NextResponse.json({ ok: true });
}
