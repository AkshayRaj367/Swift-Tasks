// Safe fetch helpers that prevent "SyntaxError: Unexpected end of JSON input"
// when an API route returns an empty body or non-JSON response.

/**
 * Parse a JSON response safely. Returns null if the body is empty or not valid JSON.
 */
export async function safeJson<T = unknown>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || text.trim().length === 0) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Fetch JSON from a URL with safe parsing.
 * Returns { ok: true, data } or { ok: false, error, status }.
 */
export async function safeFetchJson<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data: T | null }
> {
  try {
    const res = await fetch(url, init);
    const data = await safeJson<T>(res);
    if (res.ok) {
      return { ok: true, status: res.status, data: (data as T) ?? ({} as T) };
    }
    const errorMsg =
      (data as { error?: string } | null)?.error ||
      `Request failed (HTTP ${res.status})`;
    return { ok: false, status: res.status, error: errorMsg, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
      data: null,
    };
  }
}
