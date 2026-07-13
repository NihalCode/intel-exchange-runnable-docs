import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { enqueueJob, listJobs } from "@/lib/enterprise/repository";
import {
  ApiInputError,
  auditApiEvent,
  controlPlaneJson,
  errorResponse,
  exactKeys,
  readStrictJson,
  requireMutationCsrf,
  requireEnterpriseMutationRateLimit,
  requiredString,
} from "@/lib/enterprise/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "jobs.read");
  if (access instanceof NextResponse) return access;
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const jobs = await listJobs(
    access.context.organization.id,
    Number.isFinite(limit) ? limit : 50
  );
  return controlPlaneJson({ jobs });
}

export async function POST(request: NextRequest) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  const access = await guardEnterpriseApi(request, "jobs.manage");
  if (access instanceof NextResponse) return access;
  const rateLimited = requireEnterpriseMutationRateLimit(access);
  if (rateLimited) return rateLimited;
  try {
    const body = await readStrictJson(request);
    exactKeys(body, ["jobType", "payload", "runAfter"]);
    const jobType = requiredString(body.jobType, "jobType", 64);
    const payload =
      body.payload == null
        ? {}
        : body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
          ? (body.payload as Record<string, unknown>)
          : (() => {
              throw new ApiInputError("payload must be an object");
            })();
    const runAfter =
      body.runAfter == null
        ? undefined
        : requiredString(body.runAfter, "runAfter", 40);
    if (runAfter && !Number.isFinite(Date.parse(runAfter))) {
      throw new ApiInputError("runAfter must be an ISO date");
    }
    const job = await enqueueJob({
      organizationId: access.context.organization.id,
      jobType,
      payload,
      runAfter,
    });
    await auditApiEvent(access, request, {
      action: "background_job.enqueued",
      outcome: "success",
      resourceType: "background_job",
      resourceId: job.id,
      metadata: { jobType },
    });
    return controlPlaneJson({ job }, { status: 201 });
  } catch (error) {
    await auditApiEvent(access, request, {
      action: "background_job.enqueued",
      outcome: "failure",
    });
    return errorResponse(error);
  }
}
