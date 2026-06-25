import { requireDeveloperAccess } from "@/lib/developer/access";
import { runDeveloperDiagnostics } from "@/lib/developer/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireDeveloperAccess(req);
  if (denied) return denied;

  return Response.json({ ok: true, diagnostics: runDeveloperDiagnostics() });
}
