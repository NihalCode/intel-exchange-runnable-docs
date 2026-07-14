import { NextResponse, type NextRequest } from "next/server";

import { loadCredentialMaterial } from "@/lib/documentation-credentials/service";
import {
  isDocumentationProduct,
  type DocumentationProduct,
} from "@/lib/documentation-credentials/types";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import {
  ApiInputError,
  auditApiEvent,
  controlPlaneJson,
  errorResponse,
  exactKeys,
  readStrictJson,
  requireMutationCsrf,
  requiredString,
} from "@/lib/enterprise/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reveal the caller's own decrypted product credentials into the browser session
 * so the API playground can auto-fill Access ID / Secret Key. Never caches.
 */
export async function POST(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "credentials.read_metadata");
  if (access instanceof NextResponse) return access;
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;

  try {
    const body = await readStrictJson(request, 4 * 1024);
    exactKeys(body, ["productId"]);
    const productId = requiredString(body.productId, "productId", 32);
    if (!isDocumentationProduct(productId)) {
      throw new ApiInputError("productId is invalid");
    }

    const material = await loadCredentialMaterial({
      organizationId: access.context.organization.id,
      userId: access.session.user.id,
      productId: productId as DocumentationProduct,
    });

    await auditApiEvent(access, request, {
      action: "documentation.credential_session_hydrated",
      outcome: material ? "success" : "failure",
      resourceType: "user_product_credential",
      metadata: { productId, hydrated: Boolean(material) },
    });

    if (!material) {
      return controlPlaneJson({ material: null }, { status: 404 });
    }

    return controlPlaneJson(
      { material },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
