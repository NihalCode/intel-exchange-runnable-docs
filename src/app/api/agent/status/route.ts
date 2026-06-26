import { getOpenAiCredentialStatus } from "@/lib/openai/credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — public-safe agent credential status (no secrets). */
export async function GET() {
  return Response.json({
    ok: true,
    openai: getOpenAiCredentialStatus(),
  });
}
