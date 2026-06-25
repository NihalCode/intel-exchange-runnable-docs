import { spawn } from "node:child_process";
import path from "node:path";
import { requireDeveloperAccess } from "@/lib/developer/access";
import { canRunDeveloperIngest } from "@/lib/developer/diagnostics";
import { getProductOrThrow } from "@/lib/products/registry";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ productId: string }> }
) {
  const denied = requireDeveloperAccess(req);
  if (denied) return denied;

  const { productId } = await ctx.params;
  getProductOrThrow(productId);

  const ingestCheck = canRunDeveloperIngest(productId);
  if (!ingestCheck.allowed) {
    return Response.json(
      { ok: false, error: "Ingest blocked.", blockers: ingestCheck.blockers },
      { status: 403 }
    );
  }

  const script = path.join(process.cwd(), "scripts", "ingest.mjs");
  const result = await new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      const child = spawn(process.execPath, [script, `--product=${productId}`], {
        cwd: process.cwd(),
        env: process.env,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    }
  );

  if (result.code !== 0) {
    return Response.json(
      { ok: false, error: "Ingestion failed", stdout: result.stdout, stderr: result.stderr },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    productId,
    message: `Ingestion complete for ${productId}`,
    stdout: result.stdout.slice(-2000),
  });
}
