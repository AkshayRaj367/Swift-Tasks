// Unified LLM streaming layer.
//
// BYOK providers (openrouter / openai / anthropic / custom) use the Vercel AI
// SDK with the user's decrypted key. The "platform" provider uses the built-in
// z-ai-web-dev-sdk so the app is demoable with zero configuration.
//
// Everything returns a uniform async generator of text deltas, plus a
// structured error type so callers can surface provider errors (401, quota,
// bad base URL) with actionable messaging.

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, type CoreMessage } from "ai";
import type { ModelConfig } from "./types";
import { DEFAULT_SYSTEM_PROMPT } from "./constants";

export interface LLMError extends Error {
  code?: string;
  status?: number;
  provider?: string;
}

export function makeLLMError(message: string, code?: string, status?: number): LLMError {
  const e = new Error(message) as LLMError;
  e.code = code;
  e.status = status;
  return e;
}

interface StreamOpts {
  config: ModelConfig;
  apiKey: string | null; // decrypted, or null for platform
  messages: CoreMessage[];
  signal?: AbortSignal;
  systemPrompt?: string;
}

/** Yield text deltas from the configured provider. */
export async function* streamGeneration(opts: StreamOpts): AsyncGenerator<string, void, unknown> {
  const { config, apiKey, messages, signal } = opts;
  const system = opts.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  if (config.provider === "platform") {
    yield* streamPlatform(messages, system, config.model || "glm-4.6", signal);
    return;
  }

  if (!apiKey) {
    throw makeLLMError(
      `No API key configured for provider "${config.provider}". Add one in Settings.`,
      "NO_KEY"
    );
  }

  if (config.provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey });
    const result = streamText({
      model: anthropic(config.model),
      system,
      messages,
      temperature: config.temperature ?? 0.7,
      maxOutputTokens: config.maxTokens ?? 8192,
      abortSignal: signal,
    });
    try {
      for await (const part of result.fullStream) {
        if (part.type === "text-delta" && part.textDelta) {
          yield part.textDelta;
        } else if (part.type === "error") {
          throw normalizeAIError(part.error, "anthropic");
        }
      }
    } catch (err) {
      if (err instanceof Error && (err as LLMError).code) throw err;
      throw normalizeAIError(err, "anthropic");
    }
    return;
  }

  // openrouter / openai / custom all speak the OpenAI chat completions API.
  // IMPORTANT: @ai-sdk/openai v4 defaults to the Responses API (/v1/responses)
  // for known OpenAI model ids. That endpoint is (a) region-blocked in some
  // geographies and (b) NOT supported by most OpenAI-compatible third-party
  // endpoints (Groq, OpenRouter, vLLM, LM Studio, Ollama, …). We therefore
  // FORCE the Chat Completions API via openai.chat() for all of these.
  let baseURL: string | undefined;
  if (config.provider === "openrouter") {
    baseURL = config.baseURL || "https://openrouter.ai/api/v1";
  } else if (config.provider === "openai") {
    baseURL = config.baseURL || "https://api.openai.com/v1";
  } else {
    // custom — a base URL is MANDATORY, otherwise we'd silently hit OpenAI.
    baseURL = config.baseURL;
    if (!baseURL) {
      throw makeLLMError(
        `Custom provider requires a Base URL (e.g. https://api.groq.com/openai/v1). Add one in Settings, or pick a different provider.`,
        "NO_BASE_URL"
      );
    }
  }

  const openai = createOpenAI({
    apiKey,
    baseURL,
    // OpenRouter likes these headers but they're optional.
    headers:
      config.provider === "openrouter"
        ? { "HTTP-Referer": "https://swifttasks.dev", "X-Title": "Swift Tasks" }
        : undefined,
  });

  // Force Chat Completions API — see comment above.
  let result;
  try {
    result = streamText({
      model: openai.chat(config.model),
      system,
      messages,
      temperature: config.temperature ?? 0.7,
      maxOutputTokens: config.maxTokens ?? 8192,
      abortSignal: signal,
    });
  } catch (err) {
    throw normalizeAIError(err, config.provider);
  }
  // Use fullStream (not textStream) so we can catch error events that the
  // SDK would otherwise swallow silently. textStream just ends on error.
  try {
    for await (const part of result.fullStream) {
      if (part.type === "text-delta" && part.textDelta) {
        yield part.textDelta;
      } else if (part.type === "error") {
        throw normalizeAIError(part.error, config.provider);
      }
    }
  } catch (err) {
    // Re-normalize in case it's a raw error that escaped the part check.
    if (err instanceof Error && (err as LLMError).code) throw err;
    throw normalizeAIError(err, config.provider);
  }
}

/** Platform fallback using z-ai-web-dev-sdk (no user key required). */
async function* streamPlatform(
  messages: CoreMessage[],
  system: string,
  model: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  // Lazy import to keep it server-only and avoid bundling into client.
  const ZAIModule = await import("z-ai-web-dev-sdk");
  const ZAI = (ZAIModule as unknown as { default: { create: () => Promise<PlatformClient> } })
    .default;
  const zai = await ZAI.create();

  // Map CoreMessage[] to the SDK's ChatMessage shape (system role folded in).
  const sdkMessages = [
    { role: "system" as const, content: system },
    ...messages.map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    })),
  ];

  const body: Record<string, unknown> = {
    model,
    messages: sdkMessages,
    stream: true,
    thinking: { type: "disabled" },
  };

  // The SDK returns response.body (a ReadableStream<Uint8Array>) when stream:true.
  const stream = (await zai.chat.completions.create(body as never)) as unknown as
    | ReadableStream<Uint8Array>
    | { choices: { message: { content: string } }[] };

  if (!(stream instanceof ReadableStream)) {
    // Non-streaming fallback (shouldn't happen with stream:true, but be safe).
    const text =
      (stream as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message
        ?.content || "";
    if (text) yield text;
    return;
  }

  // Parse SSE manually: lines like `data: {"choices":[{"delta":{"content":"x"}}]}`.
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  try {
    while (true) {
      if (signal?.aborted) {
        reader.cancel().catch(() => {});
        throw makeLLMError("Generation cancelled", "CANCELLED");
      }
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) yield delta;
        } catch {
          // ignore keep-alive / partial
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function normalizeAIError(err: unknown, provider: string): LLMError {
  const e = err as { name?: string; message?: string; status?: number; statusCode?: number; responseStatus?: number; responseBody?: string };
  const msg = e?.message || String(err);
  // AI SDK v4 uses `statusCode`; older errors use `status`.
  const status = e?.status || e?.statusCode || e?.responseStatus;
  const body = e?.responseBody || "";

  // Region / country not supported (common with OpenAI Responses API from
  // blocked geographies, or with providers that geo-fence).
  if (
    status === 403 ||
    /forbidden|unsupported_country|region.*not.*supported|territory/i.test(msg + " " + body)
  ) {
    return makeLLMError(
      `${provider} blocked this request (HTTP 403). This is usually a geo-restriction on the provider's endpoint. If you're using OpenAI directly, try OpenRouter or the "platform" demo model instead. (${msg})`,
      "REGION_BLOCKED",
      403
    );
  }
  if (status === 401 || /401|unauthor|invalid.*key|incorrect.*api/i.test(msg)) {
    return makeLLMError(
      `Authentication failed for ${provider}. Check your API key. (${msg})`,
      "AUTH",
      401
    );
  }
  if (status === 429 || /429|rate.*limit|quota|insufficient/i.test(msg)) {
    return makeLLMError(
      `Rate limit or quota exceeded on ${provider}. Wait and retry, or check your plan. (${msg})`,
      "RATE_LIMIT",
      429
    );
  }
  if (/not.*found|model/i.test(msg) && /model/i.test(msg)) {
    return makeLLMError(`Model not found on ${provider}. Verify the model id. (${msg})`, "MODEL");
  }
  if (/fetch|network|econnrefused|enotfound|base.*url/i.test(msg)) {
    return makeLLMError(
      `Could not reach ${provider} endpoint. Check the base URL and your network. (${msg})`,
      "NETWORK"
    );
  }
  return makeLLMError(`${provider} error: ${msg}`, "PROVIDER", status);
}

/** Lightweight validation call. Returns { ok, error? }. */
export async function validateKey(
  provider: string,
  apiKey: string,
  model: string,
  baseURL?: string
): Promise<{ ok: boolean; error?: string; code?: string }> {
  try {
    const config = { provider: provider as never, model, baseURL, temperature: 0, maxTokens: 1 };
    const gen = streamGeneration({
      config,
      apiKey,
      messages: [{ role: "user", content: "ping" }],
      systemPrompt: "Reply with the single word: ok",
    });
    // Consume a single chunk — enough to confirm auth + reachability.
    const first = await gen.next();
    if (first.done) {
      return { ok: true }; // empty stream but no error = still valid
    }
    return { ok: true };
  } catch (err) {
    const e = err as LLMError;
    return { ok: false, error: e.message, code: e.code };
  }
}

interface PlatformClient {
  chat: {
    completions: {
      create: (body: unknown) => Promise<unknown>;
    };
  };
}
