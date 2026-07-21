// DELETE /api/settings/api-keys/[id]   — remove a stored key
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const key = await db.apiKeyConfig.findUnique({ where: { id } });
  if (!key || key.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.apiKeyConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
