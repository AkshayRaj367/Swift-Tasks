// GET /api/settings/api-keys/[id]/reveal-key
//   Returns the decrypted API key for client-side use.
//   This is needed when the server's IP is blocked by the provider (e.g. Groq
//   uses Cloudflare which blocks certain server IPs). By making the API call
//   from the browser instead of the server, the request uses the user's IP.
//
//   Security: this endpoint returns plaintext. It should only be called when
//   the user explicitly starts a generation with a BYOK provider.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const key = await db.apiKeyConfig.findUnique({ where: { id } });
  if (!key || key.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const value = decrypt(key.encryptedKey);
    return NextResponse.json({
      key: value,
      provider: key.provider,
      baseURL: key.baseURL,
      model: key.model,
    });
  } catch {
    return NextResponse.json({ error: "Failed to decrypt key" }, { status: 500 });
  }
}
