// POST /api/settings/api-keys/models
//   Fetches the list of available models from a provider's /models endpoint.
//   This lets the Settings dialog auto-populate the model dropdown when the
//   user pastes an API key — instead of making them guess model ids.
//
//   body: { provider, apiKey, baseURL? }
//   returns: { models: [{ id, label?, ownedBy? }] } or { error }

import { NextRequest, NextResponse } from "next/server";
import { PROVIDERS } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

interface FetchedModel {
  id: string;
  label?: string;
  ownedBy?: string;
  contextWindow?: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const provider = body.provider as string;
  const apiKey = (body.apiKey as string)?.trim();
  const baseURLInput = (body.baseURL as string)?.trim();

  if (!provider) return NextResponse.json({ error: "provider required" }, { status: 400 });

  // Platform provider has a fixed catalog.
  if (provider === "platform") {
    const def = PROVIDERS.find((p) => p.id === "platform")!;
    return NextResponse.json({
      models: def.models.map((m) => ({ id: m.id, label: m.label })),
    });
  }

  if (!apiKey) return NextResponse.json({ error: "apiKey required" }, { status: 400 });

  // Resolve the base URL.
  let baseURL: string | undefined;
  const def = PROVIDERS.find((p) => p.id === provider);
  if (provider === "openrouter") {
    baseURL = baseURLInput || def?.defaultBaseURL || "https://openrouter.ai/api/v1";
  } else if (provider === "openai") {
    baseURL = baseURLInput || def?.defaultBaseURL || "https://api.openai.com/v1";
  } else if (provider === "anthropic") {
    baseURL = baseURLInput || def?.defaultBaseURL || "https://api.anthropic.com";
  } else {
    // custom
    baseURL = baseURLInput;
    if (!baseURL) {
      return NextResponse.json(
        { error: "A base URL is required for the custom provider to fetch models." },
        { status: 400 }
      );
    }
  }

  try {
    const models = await fetchModels(provider, apiKey, baseURL);
    return NextResponse.json({ models });
  } catch (err) {
    const e = err as Error & { status?: number };
    return NextResponse.json(
      { error: e.message || "Failed to fetch models", status: e.status },
      { status: 400 }
    );
  }
}

async function fetchModels(
  provider: string,
  apiKey: string,
  baseURL: string
): Promise<FetchedModel[]> {
  // Anthropic uses a different endpoint and response shape.
  if (provider === "anthropic") {
    return fetchAnthropicModels(apiKey, baseURL);
  }

  // All OpenAI-compatible providers: GET {baseURL}/models
  const url = `${baseURL.replace(/\/$/, "")}/models`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://swifttasks.dev";
    headers["X-Title"] = "Swift Tasks";
  }

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(
      `Failed to fetch models (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  // OpenAI-compatible shape: { data: [{ id, owned_by }] }
  // OpenRouter adds: { data: [{ id, name, context_length }] }
  const raw: unknown[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.models)
      ? data.models
      : Array.isArray(data)
        ? data
        : [];

  const models: FetchedModel[] = raw
    .map((item: unknown) => {
      const m = item as {
        id?: string;
        name?: string;
        owned_by?: string;
        ownedBy?: string;
        context_length?: number;
        contextLength?: number;
      };
      if (!m.id) return null;
      return {
        id: m.id,
        label: m.name || m.id,
        ownedBy: m.owned_by || m.ownedBy,
        contextWindow: formatContext(m.context_length || m.contextLength),
      } as FetchedModel;
    })
    .filter((m): m is FetchedModel => m !== null);

  // Sort: chat-capable models first (heuristic), then alphabetically.
  models.sort((a, b) => {
    // Deprioritize embedding/image/tts/whisper models.
    const isUtility = (id: string) =>
      /embed|image|tts|whisper|moderation|transcri|dall|audio|realtime/i.test(id);
    const au = isUtility(a.id) ? 1 : 0;
    const bu = isUtility(b.id) ? 1 : 0;
    if (au !== bu) return au - bu;
    return a.id.localeCompare(b.id);
  });

  return models;
}

async function fetchAnthropicModels(
  apiKey: string,
  baseURL: string
): Promise<FetchedModel[]> {
  // Anthropic: GET /v1/models with x-api-key + anthropic-version headers.
  const url = `${baseURL.replace(/\/$/, "")}/v1/models`;
  const res = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(
      `Anthropic models fetch failed (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const raw: unknown[] = Array.isArray(data?.data) ? data.data : [];
  return raw
    .map((item: unknown) => {
      const m = item as { id?: string; display_name?: string };
      if (!m.id) return null;
      return {
        id: m.id,
        label: m.display_name || m.id,
        ownedBy: "anthropic",
      } as FetchedModel;
    })
    .filter((m): m is FetchedModel => m !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function formatContext(tokens?: number): string | undefined {
  if (!tokens || tokens < 1000) return undefined;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  return `${Math.round(tokens / 1000)}K`;
}
