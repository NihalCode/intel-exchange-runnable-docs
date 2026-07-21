import { NextResponse } from "next/server";

import { getRetrievalHealthStatus } from "@/lib/agent/retrieval-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public retrieval config probe — booleans + safe reasonCodes only.
 * Does not call OpenAI/Pinecone and never returns secret values.
 */
export async function GET() {
  const status = getRetrievalHealthStatus();
  return NextResponse.json(
    {
      status: status.ready ? "ready" : "degraded",
      ...status,
    },
    { status: status.ready ? 200 : 503 }
  );
}
