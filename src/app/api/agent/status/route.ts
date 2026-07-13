import { getOpenAiCredentialStatus } from "@/lib/openai/credentials";
import { guardAskAgent } from "@/lib/documentation-auth/guard-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — authenticated agent credential status (no secrets). */
export async function GET(request: Request) {
  const session = await guardAskAgent(request as import("next/server").NextRequest);
  if (session instanceof Response) return session;
  return Response.json({
    ok: true,
    openai: getOpenAiCredentialStatus(),
  });
}
