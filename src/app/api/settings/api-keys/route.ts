// GET  /api/settings/api-keys   — list keys (masked, never plaintext)
// POST /api/settings/api-keys   — save a new key (encrypt at rest, validate)
//   body: { provider, apiKey, model, baseURL?, label?, makeDefault? }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { encrypt, maskKey } from "@/lib/crypto";
import { validateKey } from "@/lib/llm";
import type { ApiKeyConfigPublic } from "@/lib/types";

function toPublic(k: {
  id: string;
  label: string;
  provider: string;
  maskedKey: string;
  baseURL: string | null;
  model: string;
  isDefault: boolean;
  isValid: boolean;
  lastValidated: Date | null;
}): ApiKeyConfigPublic {
  return {
    id: k.id,
    label: k.label,
    provider: k.provider as ApiKeyConfigPublic["provider"],
    maskedKey: k.maskedKey,
    baseURL: k.baseURL,
    model: k.model,
    isDefault: k.isDefault,
    isValid: k.isValid,
    lastValidated: k.lastValidated ? k.lastValidated.toISOString() : null,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  const keys = await db.apiKeyConfig.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ keys: keys.map(toPublic) });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const provider = body.provider as string;
  const apiKey = (body.apiKey as string)?.trim();
  const model = (body.model as string)?.trim();
  const baseURL = (body.baseURL as string)?.trim() || null;
  const label = (body.label as string)?.trim() || provider;
  const makeDefault = body.makeDefault !== false;

  if (!provider) return NextResponse.json({ error: "provider required" }, { status: 400 });
  if (provider !== "platform" && !apiKey)
    return NextResponse.json({ error: "apiKey required for BYOK providers" }, { status: 400 });
  if (!model) return NextResponse.json({ error: "model required" }, { status: 400 });

  // Validate before storing (unless platform, which needs no key).
  let isValid = true;
  let validationError: string | undefined;
  let validationCode: string | undefined;
  if (provider !== "platform") {
    const result = await validateKey(provider, apiKey!, model, baseURL || undefined);
    isValid = result.ok;
    validationError = result.error;
    validationCode = result.code;
  }

  // Encrypt at rest.
  const encryptedKey = provider === "platform" ? "" : encrypt(apiKey!);
  const maskedKey = provider === "platform" ? "" : maskKey(apiKey!);

  // Upsert by (userId, label).
  const existing = await db.apiKeyConfig.findUnique({
    where: { userId_label: { userId: user.id, label } },
  });

  if (makeDefault) {
    // Un-default any other keys for this user (atomic-ish).
    await db.apiKeyConfig.updateMany({
      where: { userId: user.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  const data = {
    provider,
    encryptedKey,
    maskedKey,
    baseURL,
    model,
    isDefault: makeDefault,
    isValid,
    lastValidated: new Date(),
  };

  let record;
  if (existing) {
    record = await db.apiKeyConfig.update({ where: { id: existing.id }, data });
  } else {
    record = await db.apiKeyConfig.create({
      data: { userId: user.id, label, ...data },
    });
  }

  if (!isValid) {
    return NextResponse.json(
      {
        key: toPublic(record),
        warning: `Key saved but validation failed: ${validationError}`,
        code: validationCode,
      },
      { status: 200 }
    );
  }
  return NextResponse.json({ key: toPublic(record) }, { status: 201 });
}
