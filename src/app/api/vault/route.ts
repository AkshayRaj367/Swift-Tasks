// GET  /api/vault          — list vault entries (masked values only)
// POST /api/vault          — create a new vault entry (encrypts the value)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { encrypt, maskKey } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  const entries = await db.vaultEntry.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });
  // Never return encryptedValue — only masked metadata.
  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      label: e.label,
      category: e.category,
      maskedValue: e.maskedValue,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const label = (body.label as string)?.trim();
  const value = (body.value as string)?.trim();
  const category = (body.category as string)?.trim() || "apikey";
  const note = (body.note as string)?.trim() || null;

  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });
  if (!value) return NextResponse.json({ error: "value required" }, { status: 400 });

  const encryptedValue = encrypt(value);
  const maskedValue = maskKey(value);

  const entry = await db.vaultEntry.create({
    data: {
      userId: user.id,
      label,
      category,
      encryptedValue,
      maskedValue,
      note,
    },
  });

  return NextResponse.json({
    entry: {
      id: entry.id,
      label: entry.label,
      category: entry.category,
      maskedValue: entry.maskedValue,
      note: entry.note,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    },
  }, { status: 201 });
}
