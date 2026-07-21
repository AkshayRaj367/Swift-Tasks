// GET /api/health — lightweight liveness + crypto self-test + provider catalog
import { verifyCrypto } from "@/lib/crypto";
import { PROVIDERS } from "@/lib/constants";

export async function GET() {
  return Response.json({
    ok: true,
    crypto: verifyCrypto(),
    providers: PROVIDERS,
    ts: Date.now(),
  });
}
