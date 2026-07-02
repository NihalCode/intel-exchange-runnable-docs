import { guardDeveloperDiagnostics } from "@/lib/documentation-auth/guard-api";
import {
  canRunLiveValidation,
  validateAllProducts,
  validateProductEndpoints,
} from "@/lib/developer/live-validate";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST — static (+ optional live) endpoint validation for developer workflows. */
export async function POST(req: Request) {
  const session = await guardDeveloperDiagnostics(req as import("next/server").NextRequest);
  if (session instanceof Response) return session;

  let body: {
    productId?: string;
    live?: boolean;
    liveLimit?: number;
    slugs?: string[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const live = Boolean(body.live);
  if (live) {
    const check = canRunLiveValidation(body.productId);
    if (!check.allowed) {
      return Response.json(
        { ok: false, error: "Live validation blocked.", blockers: check.blockers },
        { status: 403 }
      );
    }
  }

  const options = {
    live,
    liveLimit: typeof body.liveLimit === "number" ? body.liveLimit : 15,
    slugs: body.slugs,
  };

  try {
    if (body.productId?.trim()) {
      const report = await validateProductEndpoints(body.productId.trim(), options);
      return Response.json({
        ok: true,
        live,
        reports: [report],
        summary: aggregateSummary([report]),
      });
    }

    const reports = await validateAllProducts(options);
    return Response.json({
      ok: true,
      live,
      reports,
      summary: aggregateSummary(reports),
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: "Validation failed.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

function aggregateSummary(reports: Awaited<ReturnType<typeof validateProductEndpoints>>[]) {
  return {
    products: reports.length,
    endpoints: reports.reduce((n, r) => n + r.endpointCount, 0),
    staticPass: reports.reduce((n, r) => n + r.static.pass, 0),
    staticFail: reports.reduce((n, r) => n + r.static.fail, 0),
    livePass: reports.reduce((n, r) => n + r.live.pass, 0),
    liveFail: reports.reduce((n, r) => n + r.live.fail, 0),
    liveSkip: reports.reduce((n, r) => n + r.live.skip, 0),
  };
}
