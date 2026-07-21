// AES-256-GCM envelope encryption for BYOK API keys.
// Key material comes from ENCRYPTION_KEY env var (32 bytes / 64 hex chars).
// Keys are NEVER logged and NEVER returned to the client in plaintext.

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const KEY_HEX = process.env.ENCRYPTION_KEY;
if (!KEY_HEX || KEY_HEX.length !== 64) {
  // In dev we generate an ephemeral key so the app still runs; in prod this is a hard fail.
  console.warn(
    "[crypto] ENCRYPTION_KEY missing or not 32 bytes (64 hex chars). Using an ephemeral in-memory key — keys will not survive a restart."
  );
}

const EPHEMERAL_KEY = randomBytes(32);
const KEY = KEY_HEX && KEY_HEX.length === 64 ? Buffer.from(KEY_HEX, "hex") : EPHEMERAL_KEY;

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM standard 96-bit IV

export interface EncryptedPayload {
  /** base64 iv : authTag : ciphertext */
  v: string;
}

/** Encrypt a plaintext string. Returns a serialized envelope. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/** Decrypt a serialized envelope. Throws on tamper (auth tag mismatch). */
export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid ciphertext envelope");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

/** Mask a key for safe display: keep first 3 and last 4 chars. */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

/** Round-trip self-test — used by /api/health. */
export function verifyCrypto(): boolean {
  try {
    const pt = "swift-tasks-self-test-🔥";
    return decrypt(encrypt(pt)) === pt;
  } catch {
    return false;
  }
}
