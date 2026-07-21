// GET /api/vault/[id]/reveal — decrypt and return the plaintext value.
// This is the ONLY endpoint that returns a plaintext secret. It requires an
// explicit client action (clicking "Reveal") and should be used sparingly.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const entry = await db.vaultEntry.findUnique({ where: { id } });
  if (!entry || entry.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const value = decrypt(entry.encryptedValue);
    return NextResponse.json({ value });
  } catch {
    return NextResponse.json({ error: "Failed to decrypt (key may have changed)" }, { status: 500 });
  }
}
