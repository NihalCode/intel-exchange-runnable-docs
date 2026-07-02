import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { guardDeveloperDiagnostics } from "@/lib/documentation-auth/guard-api";
import { canRunDeveloperIngest } from "@/lib/developer/diagnostics";
import { getProductOrThrow } from "@/lib/products/registry";
import { parsePostmanCollection, parsedEndpointsToPageRecords } from "@/lib/postman";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST — parse Postman collection JSON (preview, no write). */
export async function POST(req: Request) {
  const session = await guardDeveloperDiagnostics(req as import("next/server").NextRequest);
  if (session instanceof Response) return session;

  let body: { productId?: string; collection?: unknown; write?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const productId = body.productId?.trim();
  if (!productId) {
    return Response.json({ ok: false, error: "productId is required." }, { status: 400 });
  }

  try {
    getProductOrThrow(productId);
  } catch {
    return Response.json({ ok: false, error: `Unknown product: ${productId}` }, { status: 400 });
  }

  if (!body.collection) {
    return Response.json({ ok: false, error: "collection JSON is required." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parsePostmanCollection(body.collection, { productId });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: "Failed to parse Postman collection.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 400 }
    );
  }

  if (!body.write) {
    return Response.json({
      ok: true,
      preview: true,
      productId,
      collectionName: parsed.collectionName,
      endpointCount: parsed.endpoints.length,
      sectionCount: parsed.sections.length,
      credentialPlaceholders: parsed.credentialPlaceholders,
      endpoints: parsed.endpoints.slice(0, 20).map((e) => ({
        slug: e.slug,
        method: e.method,
        path: e.path,
        runnableStatus: e.runnableStatus,
      })),
    });
  }

  const ingestCheck = canRunDeveloperIngest(productId);
  if (!ingestCheck.allowed) {
    return Response.json(
      { ok: false, error: "Ingest blocked.", blockers: ingestCheck.blockers },
      { status: 403 }
    );
  }

  const tmpDir = path.join(process.cwd(), ".tmp", "postman-import");
  await mkdir(tmpDir, { recursive: true });
  const collectionPath = path.join(tmpDir, `${productId}-${Date.now()}.json`);
  await writeFile(collectionPath, JSON.stringify(body.collection), "utf8");

  const script = path.join(process.cwd(), "scripts", "ingest.mjs");
  const result = await new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      const child = spawn(
        process.execPath,
        [script, `--product=${productId}`, `--collection-file=${collectionPath}`, `--parser=ts`],
        { cwd: process.cwd(), env: process.env }
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    }
  );

  if (result.code !== 0) {
    return Response.json(
      {
        ok: false,
        error: "Ingestion failed.",
        stdout: result.stdout.slice(-3000),
        stderr: result.stderr.slice(-1000),
        parsedSummary: {
          endpointCount: parsed.endpoints.length,
          records: parsedEndpointsToPageRecords(parsed).length,
        },
      },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    productId,
    message: `Imported ${parsed.endpoints.length} endpoints from Postman collection.`,
    collectionName: parsed.collectionName,
    credentialPlaceholders: parsed.credentialPlaceholders,
    stdout: result.stdout.slice(-2000),
  });
}
