import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { guardEnterpriseApi, type EnterpriseAccess } from "@/lib/enterprise/guard";
import { processControlPlaneJobs } from "@/lib/enterprise/job-processor";
import { mapEnterpriseRole } from "@/lib/enterprise/policy";
import {
  auditApiEvent,
  controlPlaneJson,
  errorResponse,
} from "@/lib/enterprise/http";

export const runtime = "nodejs";

const CRON_HEADER = "x-control-plane-cron-secret";

type ProcessAuth =
  | { mode: "cron" }
  | { mode: "session"; access: EnterpriseAccess };

async function authorizeProcessRequest(
  request: NextRequest
): Promise<ProcessAuth | NextResponse> {
  const configuredSecret = process.env.CONTROL_PLANE_CRON_SECRET?.trim();
  const suppliedSecret = request.headers.get(CRON_HEADER)?.trim();
  if (
    configuredSecret &&
    suppliedSecret &&
    suppliedSecret === configuredSecret
  ) {
    return { mode: "cron" };
  }

  const access = await guardEnterpriseApi(request, "jobs.manage");
  if (access instanceof NextResponse) return access;
  const role = mapEnterpriseRole(access.context.principal.role);
  if (role !== "owner" && role !== "admin") {
    return controlPlaneJson({ error: "Forbidden" }, { status: 403 });
  }
  return { mode: "session", access };
}

export async function POST(request: NextRequest) {
  const auth = await authorizeProcessRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "25");
    const result = await processControlPlaneJobs({
      organizationId:
        auth.mode === "session"
          ? auth.access.context.organization.id
          : undefined,
      limit: Number.isFinite(limit) ? limit : 25,
    });

    if (auth.mode === "session") {
      await auditApiEvent(auth.access, request, {
        action: "background_jobs.processed",
        outcome: "success",
        metadata: {
          scheduledChangesActivated: result.scheduledChangesActivated,
          jobsCompleted: result.jobsCompleted,
          jobsFailed: result.jobsFailed,
        },
      });
    }

    return controlPlaneJson({ result });
  } catch (error) {
    if (auth.mode === "session") {
      await auditApiEvent(auth.access, request, {
        action: "background_jobs.processed",
        outcome: "failure",
      });
    }
    return errorResponse(error);
  }
}

export async function GET(_request: NextRequest) {
  return controlPlaneJson(
    { error: "Use POST to process due jobs" },
    { status: 405 }
  );
}
