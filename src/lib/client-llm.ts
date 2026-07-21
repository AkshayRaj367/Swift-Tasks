"use client";

// Client-side LLM streaming.
//
// This module makes API calls DIRECTLY from the browser to the provider,
// bypassing our server entirely. This is needed when the server's IP is
// blocked by the provider (e.g. Groq uses Cloudflare which blocks certain
// server IPs).
//
// Flow:
//   Browser → Provider API (directly, using the user's IP)
//   Browser → Our Server (only for persisting files/messages)
//
// The user's API key is fetched via /api/settings/api-keys/[id]/reveal-key
// and used in the Authorization header of the direct fetch.

import { DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";
import type { ModelConfig, ChatMessage } from "@/lib/types";

export interface ClientStreamResult {
  text: string;
  error: string | null;
}

/**
 * Fetch the decrypted API key from the server.
 */
export async function fetchDecryptedKey(
  keyId: string
): Promise<{ key: string; provider: string; baseURL: string | null; model: string } | null> {
  try {
    const res = await fetch(`/api/settings/api-keys/${keyId}/reveal-key`);
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

/**
 * Find the saved API key ID for a given provider.
 */
export async function findKeyIdForProvider(provider: string): Promise<string | null> {
  try {
    const res = await fetch("/api/settings/api-keys");
    if (!res.ok) return null;
    const { keys } = await res.json();
    const match = keys.find((k: { provider: string; id: string }) => k.provider === provider);
    return match?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Stream a generation DIRECTLY from the browser to the provider.
 *
 * This bypasses our server, so the request uses the user's IP (not the
 * server's IP). Works for providers that block the server's IP (e.g. Groq).
 *
 * @param config - model config (provider, model, baseURL)
 * @param apiKey - decrypted API key
 * @param systemPrompt - system prompt
 * @param messages - conversation history
 * @param onChunk - callback for each text chunk
 * @param signal - abort signal for cancellation
 * @returns the full text + error (if any)
 */
export async function streamFromBrowser(
  config: ModelConfig,
  apiKey: string,
  systemPrompt: string,
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<ClientStreamResult> {
  // Resolve the base URL + endpoint.
  let baseURL: string;
  if (config.provider === "openrouter") {
    baseURL = config.baseURL || "https://openrouter.ai/api/v1";
  } else if (config.provider === "openai") {
    baseURL = config.baseURL || "https://api.openai.com/v1";
  } else {
    // custom
    baseURL = config.baseURL || "";
    if (!baseURL) {
      return { text: "", error: "Custom provider requires a Base URL." };
    }
  }

  // Anthropic uses a different API shape — handle separately.
  if (config.provider === "anthropic") {
    return streamAnthropicFromBrowser(config, apiKey, systemPrompt, messages, onChunk, signal);
  }

  // All OpenAI-compatible providers: POST {baseURL}/chat/completions
  const url = `${baseURL.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://swifttasks.dev";
    headers["X-Title"] = "Swift Tasks";
  }

  const body = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    ],
    stream: true,
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens ?? 8192,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let errorMsg: string;
      if (res.status === 401 || res.status === 403) {
        errorMsg = `Your API key was rejected by ${config.provider} (HTTP ${res.status}).`;
      } else if (res.status === 404) {
        errorMsg = `Model "${config.model}" not found on ${config.provider}.`;
      } else if (res.status === 429) {
        errorMsg = `Rate limit reached on ${config.provider}. Wait and try again.`;
      } else {
        errorMsg = `${config.provider} returned HTTP ${res.status}.`;
      }
      return { text: "", error: `${errorMsg} ${text.slice(0, 200)}` };
    }

    // Process the SSE stream.
    const reader = res.body?.getReader();
    if (!reader) {
      return { text: "", error: "No response body from provider." };
    }

    const decoder = new TextDecoder();
    let sseBuffer = "";
    let fullText = "";

    while (true) {
      if (signal?.aborted) {
        reader.cancel().catch(() => {});
        break;
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
        if (data === "[DONE]") {
          return { text: fullText, error: null };
        }
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            fullText += delta;
            onChunk(delta);
          }
        } catch {
          // ignore keep-alive / partial
        }
      }
    }

    return { text: fullText, error: null };
  } catch (err) {
    if (signal?.aborted) {
      return { text: "", error: null }; // cancelled, not an error
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/failed to fetch|networkerror|cors/i.test(msg)) {
      // Provider doesn't support CORS (browser-direct calls).
      // Give a clear, actionable message.
      const isGroq = /groq/i.test(baseURL);
      return {
        text: "",
        error: isGroq
          ? `Groq doesn't allow direct browser requests (no CORS support). To use your Groq key, switch to OpenRouter and select a Groq model (e.g. groq/llama-3.3-70b-versatile). OpenRouter supports browser-direct calls and works from any IP.`
          : `${config.provider} doesn't allow direct browser requests (CORS blocked). Try OpenRouter or the platform demo model.`,
        corsBlocked: true,
      } as ClientStreamResult & { corsBlocked: boolean };
    }
    return { text: "", error: msg };
  }
}

/**
 * Stream from Anthropic directly (different API shape).
 */
async function streamAnthropicFromBrowser(
  config: ModelConfig,
  apiKey: string,
  systemPrompt: string,
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<ClientStreamResult> {
  const baseURL = config.baseURL || "https://api.anthropic.com";
  const url = `${baseURL.replace(/\/$/, "")}/v1/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      stream: true,
      max_tokens: config.maxTokens ?? 8192,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { text: "", error: `Anthropic returned HTTP ${res.status}. ${text.slice(0, 200)}` };
  }

  const reader = res.body?.getReader();
  if (!reader) return { text: "", error: "No response body." };

  const decoder = new TextDecoder();
  let sseBuffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      try {
        const json = JSON.parse(trimmed.slice(5).trim());
        if (json.type === "content_block_delta" && json.delta?.text) {
          fullText += json.delta.text;
          onChunk(json.delta.text);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return { text: fullText, error: null };
}
