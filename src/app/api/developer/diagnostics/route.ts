import { guardDeveloperDiagnostics } from "@/lib/documentation-auth/guard-api";
import { runDeveloperDiagnostics } from "@/lib/developer/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await guardDeveloperDiagnostics(req as import("next/server").NextRequest);
  if (session instanceof Response) return session;

  return Response.json({ ok: true, diagnostics: runDeveloperDiagnostics() });
}
