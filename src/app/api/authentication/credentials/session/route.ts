import { NextResponse, type NextRequest } from "next/server";

import { requireSession } from "@/lib/documentation-auth/session";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import {
  ApiInputError,
  controlPlaneJson,
  errorResponse,
  exactKeys,
  readStrictJson,
  requireMutationCsrf,
  requiredString,
} from "@/lib/enterprise/http";
import { isDocumentationProduct } from "@/lib/documentation-credentials/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Credential hydration is disabled. Access ID and Secret Key stay in browser memory
 * only for the current tab session and are never persisted server-side.
 */
export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;
  try {
    await resolveOrganizationContext(session);
  } catch {
    return controlPlaneJson({ error: "Forbidden" }, { status: 403 });
  }
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;

  try {
    const body = await readStrictJson(request, 4 * 1024);
    exactKeys(body, ["productId"]);
    const productId = requiredString(body.productId, "productId", 32);
    if (!isDocumentationProduct(productId)) {
      throw new ApiInputError("productId is invalid");
    }

    return controlPlaneJson(
      {
        error:
          "Credentials are memory-only. Connect at /authentication in this browser tab; they are not stored or reloaded from the server.",
        material: null,
      },
      { status: 410 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
