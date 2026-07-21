// GET  /api/projects          — list projects for the local user
// POST /api/projects          — create a new project (isolated context)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import type { ModelConfig, ProjectSummary } from "@/lib/types";

async function summarize(p: {
  id: string;
  name: string;
  description: string | null;
  status: string;
  modelConfig: string;
  createdAt: Date;
  updatedAt: Date;
}): Promise<ProjectSummary> {
  const counts = await db.project.findUnique({
    where: { id: p.id },
    select: { _count: { select: { files: true, messages: true } } },
  });
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status as ProjectSummary["status"],
    modelConfig: safeParseConfig(p.modelConfig),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    fileCount: counts?._count.files ?? 0,
    messageCount: counts?._count.messages ?? 0,
  };
}

function safeParseConfig(s: string): ModelConfig {
  try {
    const c = JSON.parse(s);
    return {
      provider: c.provider || "platform",
      model: c.model || "glm-4.6",
      baseURL: c.baseURL,
      temperature: c.temperature,
      maxTokens: c.maxTokens,
      systemPromptOverride: c.systemPromptOverride,
    };
  } catch {
    return { provider: "platform", model: "glm-4.6" };
  }
}

export async function GET() {
  const user = await getCurrentUser();
  const projects = await db.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });
  const summaries = await Promise.all(projects.map(summarize));
  return NextResponse.json({ projects: summaries });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const name = (body.name as string)?.trim() || "Untitled Project";
  const description = (body.description as string)?.trim() || null;

  // Resolve default model config from the user's default ApiKeyConfig, else platform.
  const defaultKey = await db.apiKeyConfig.findFirst({
    where: { userId: user.id, isDefault: true },
  });
  let modelConfig: ModelConfig;
  if (defaultKey) {
    modelConfig = {
      provider: defaultKey.provider as ModelConfig["provider"],
      model: defaultKey.model,
      baseURL: defaultKey.baseURL || undefined,
    };
  } else {
    modelConfig = { provider: "platform", model: "glm-4.6" };
  }

  const project = await db.project.create({
    data: {
      userId: user.id,
      name,
      description,
      modelConfig: JSON.stringify(modelConfig),
      status: "empty",
    },
  });

  const summary = await summarize(project);
  return NextResponse.json({ project: summary }, { status: 201 });
}
