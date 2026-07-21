// POST /api/settings/api-keys/test — test an API key without saving it

import { NextRequest, NextResponse } from "next/server";
import { validateKey } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const provider = (body.provider as string)?.trim();
  const apiKey = (body.apiKey as string)?.trim();
  const model = (body.model as string)?.trim();
  const baseURL = (body.baseURL as string)?.trim() || undefined;

  if (!provider) {
    return NextResponse.json({ ok: false, error: "provider is required" }, { status: 400 });
  }

  if (provider !== "platform" && !apiKey) {
    return NextResponse.json({ ok: false, error: "apiKey is required" }, { status: 400 });
  }

  if (!model) {
    return NextResponse.json({ ok: false, error: "model is required" }, { status: 400 });
  }

  if (provider === "platform") {
    return NextResponse.json({ ok: true });
  }

  const result = await validateKey(provider, apiKey!, model, baseURL);
  return NextResponse.json(result);
}
