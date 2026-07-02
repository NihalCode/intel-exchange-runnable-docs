import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse, type NextRequest } from "next/server";

import {
  guardDeveloperDiagnostics,
  guardManageSources,
  guardSyncDocs,
} from "@/lib/documentation-auth/guard-api";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { canRunProductIngest } from "@/lib/developer/ingest-access";
import { formatIngestFailure } from "@/lib/developer/ingest-errors";
import {
  ingestSpawnEnv,
  isVercelRuntime,
  postmanImportTempDir,
  postmanIngestParser,
  VERCEL_INGEST_ROOT,
} from "@/lib/developer/ingest-runtime";
import { getProductOrThrow } from "@/lib/products/registry";
import { parsePostmanCollection, parsedEndpointsToPageRecords } from "@/lib/postman";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST — parse Postman collection JSON (preview or import). */
export async function POST(req: Request) {
  try {
    return await handlePostman(req as NextRequest);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "Postman route failed.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

async function handlePostman(req: NextRequest) {
  const request = req;
  let body: { productId?: string; collection?: unknown; write?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const write = Boolean(body.write);

  if (isAuthEnabled()) {
    const sources = await guardManageSources(request);
    if (sources instanceof NextResponse) return sources;
    if (write) {
      const sync = await guardSyncDocs(request);
      if (sync instanceof NextResponse) return sync;
    }
  } else {
    const session = await guardDeveloperDiagnostics(request);
    if (session instanceof NextResponse) return session;
  }

  const productId = body.productId?.trim();
  if (!productId) {
    return NextResponse.json({ ok: false, error: "productId is required." }, { status: 400 });
  }

  try {
    getProductOrThrow(productId);
  } catch {
    return NextResponse.json({ ok: false, error: `Unknown product: ${productId}` }, { status: 400 });
  }

  if (!body.collection) {
    return NextResponse.json({ ok: false, error: "collection JSON is required." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parsePostmanCollection(body.collection, { productId });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to parse Postman collection.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 400 }
    );
  }

  if (!write) {
    return NextResponse.json({
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

  const ingestCheck = canRunProductIngest(productId);
  if (!ingestCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: "Ingest blocked.", blockers: ingestCheck.blockers },
      { status: 403 }
    );
  }

  const tmpDir = postmanImportTempDir();
  await mkdir(tmpDir, { recursive: true });
  const collectionPath = path.join(tmpDir, `${productId}-${Date.now()}.json`);
  await writeFile(collectionPath, JSON.stringify(body.collection), "utf8");

  const parser = postmanIngestParser();
  const script = path.join(process.cwd(), "scripts", "ingest.mjs");
  const result = await new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      const child = spawn(
        process.execPath,
        [
          script,
          `--product=${productId}`,
          `--collection-file=${collectionPath}`,
          `--parser=${parser}`,
        ],
        { cwd: process.cwd(), env: ingestSpawnEnv() }
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    }
  );

  if (result.code !== 0) {
    const { error, detail } = formatIngestFailure({
      stderr: result.stderr,
      stdout: result.stdout,
      productId,
    });
    return NextResponse.json(
      {
        ok: false,
        error,
        detail,
        stdout: result.stdout.slice(-3000),
        stderr: result.stderr.slice(-1000),
        parsedSummary: {
          endpointCount: parsed.endpoints.length,
          records: parsedEndpointsToPageRecords(parsed).length,
        },
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    productId,
    message: `Imported ${parsed.endpoints.length} endpoints from Postman collection.`,
    collectionName: parsed.collectionName,
    credentialPlaceholders: parsed.credentialPlaceholders,
    stdout: result.stdout.slice(-2000),
    parser,
    ...(isVercelRuntime()
      ? {
          ephemeral: true,
          outputRoot: VERCEL_INGEST_ROOT,
          note: "On Vercel, imported files are written to /tmp only (not deployed). Use CI or git commit to publish doc updates.",
        }
      : {}),
  });
}
