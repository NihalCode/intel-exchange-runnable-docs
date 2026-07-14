import { NextResponse, type NextRequest } from "next/server";

import {
  listCredentialMetadata,
  revokeCredential,
} from "@/lib/documentation-credentials/repository";
import {
  CredentialValidationError,
  validateAndStoreCredential,
} from "@/lib/documentation-credentials/service";
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

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "credentials.read_metadata");
  if (access instanceof NextResponse) return access;
  const credentials = await listCredentialMetadata(
    access.context.organization.id,
    access.session.user.id
  );
  return controlPlaneJson({ credentials });
}

export async function POST(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "credentials.read_metadata");
  if (access instanceof NextResponse) return access;
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  try {
    const body = await readStrictJson(request, 32 * 1024);
    exactKeys(body, ["productId", "baseUrl", "accessId", "secretKey"]);
    const productId = requiredString(body.productId, "productId", 32);
    if (!isDocumentationProduct(productId)) {
      throw new ApiInputError("productId is invalid");
    }
    const credential = await validateAndStoreCredential({
      organizationId: access.context.organization.id,
      userId: access.session.user.id,
      productId,
      baseUrl: requiredString(body.baseUrl, "baseUrl", 2048),
      accessId: requiredString(body.accessId, "accessId", 512),
      secretKey: requiredString(body.secretKey, "secretKey", 2048),
    });
    await auditApiEvent(access, request, {
      action: "documentation.credential_connected",
      outcome: credential.status === "valid" ? "success" : "failure",
      resourceType: "user_product_credential",
      resourceId: credential.id,
      metadata: { productId, status: credential.status },
    });
    return controlPlaneJson({ credential }, { status: credential.status === "valid" ? 200 : 422 });
  } catch (error) {
    if (error instanceof CredentialValidationError) {
      return controlPlaneJson(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "credentials.read_metadata");
  if (access instanceof NextResponse) return access;
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  const productId = new URL(request.url).searchParams.get("productId") ?? "";
  if (!isDocumentationProduct(productId)) {
    return controlPlaneJson({ error: "productId is invalid" }, { status: 400 });
  }
  const removed = await revokeCredential(
    access.context.organization.id,
    access.session.user.id,
    productId as DocumentationProduct
  );
  await auditApiEvent(access, request, {
    action: "documentation.credential_disconnected",
    outcome: "success",
    resourceType: "user_product_credential",
    metadata: { productId, existed: removed },
  });
  return controlPlaneJson({ ok: true });
}
