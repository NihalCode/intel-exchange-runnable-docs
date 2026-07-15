import { NextResponse, type NextRequest } from "next/server";

import { guardSyncDocs } from "@/lib/documentation-auth/guard-api";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { requireDeveloperAccess } from "@/lib/developer/access";
import { canRunProductIngest } from "@/lib/developer/ingest-access";
import { formatIngestFailure } from "@/lib/developer/ingest-errors";
import {
  isVercelRuntime,
  runIngestScript,
  VERCEL_INGEST_ROOT,
} from "@/lib/developer/ingest-runtime";
import { getProductOrThrow } from "@/lib/products/registry";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ productId: string }> }
) {
  const request = req as NextRequest;

  if (isAuthEnabled()) {
    const session = await guardSyncDocs(request);
    if (session instanceof NextResponse) return session;
  } else {
    const denied = requireDeveloperAccess(req);
    if (denied) return denied;
  }

  const { productId } = await ctx.params;
  getProductOrThrow(productId);

  const ingestCheck = canRunProductIngest(productId);
  if (!ingestCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: "Ingest blocked.", blockers: ingestCheck.blockers },
      { status: 403 }
    );
  }

  const result = await runIngestScript([`--product=${productId}`]);

  if (result.code !== 0) {
    const { error, detail } = formatIngestFailure({
      stderr: result.stderr,
      stdout: result.stdout,
      productId,
    });
    return NextResponse.json(
      { ok: false, error, detail, stdout: result.stdout, stderr: result.stderr },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    productId,
    message: `Ingestion complete for ${productId}`,
    stdout: result.stdout.slice(-2000),
    ...(isVercelRuntime()
      ? {
          ephemeral: true,
          outputRoot: VERCEL_INGEST_ROOT,
          note: "On Vercel, ingested files are written to /tmp only (not deployed). Use CI or git commit to publish doc updates.",
        }
      : {}),
  });
}
