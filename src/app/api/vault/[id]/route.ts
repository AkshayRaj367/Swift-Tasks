// DELETE /api/vault/[id]           — delete a vault entry
// PATCH  /api/vault/[id]           — update label/category/note (and optionally value)
// GET    /api/vault/[id]/reveal    — decrypt and return the plaintext value

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { encrypt, decrypt, maskKey } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const entry = await db.vaultEntry.findUnique({ where: { id } });
  if (!entry || entry.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.label === "string") data.label = body.label.trim();
  if (typeof body.category === "string") data.category = body.category.trim();
  if (typeof body.note === "string") data.note = body.note.trim() || null;
  if (typeof body.value === "string" && body.value.trim()) {
    data.encryptedValue = encrypt(body.value.trim());
    data.maskedValue = maskKey(body.value.trim());
  }

  const updated = await db.vaultEntry.update({ where: { id }, data });
  return NextResponse.json({
    entry: {
      id: updated.id,
      label: updated.label,
      category: updated.category,
      maskedValue: updated.maskedValue,
      note: updated.note,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const entry = await db.vaultEntry.findUnique({ where: { id } });
  if (!entry || entry.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.vaultEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
