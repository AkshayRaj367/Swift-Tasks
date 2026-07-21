// GET  /api/projects/[id]/deploy   — list past deploys for this project
// POST /api/projects/[id]/deploy   — create a new deploy record (manual/external)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deploys = await db.deployment.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    deploys: deploys.map((d) => ({
      id: d.id,
      target: d.target,
      url: d.url,
      siteName: d.siteName,
      status: d.status,
      error: d.error,
      createdAt: d.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { target, url, siteName, status, error } = body as {
    target: string;
    url: string;
    siteName?: string;
    status?: string;
    error?: string;
  };

  if (!target || !url) return NextResponse.json({ error: "target and url required" }, { status: 400 });

  const deploy = await db.deployment.create({
    data: {
      projectId: id,
      target,
      url,
      siteName,
      status: status || "live",
      error,
    },
  });

  return NextResponse.json({
    deploy: {
      id: deploy.id,
      target: deploy.target,
      url: deploy.url,
      siteName: deploy.siteName,
      status: deploy.status,
      error: deploy.error,
      createdAt: deploy.createdAt.toISOString(),
    },
  });
}
