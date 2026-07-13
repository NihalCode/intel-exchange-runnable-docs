import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { ENTERPRISE_PERMISSIONS } from "@/lib/enterprise/types";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import {
  CSRF_COOKIE_NAME,
  createCsrfToken,
  csrfCookieOptions,
} from "@/lib/enterprise/csrf";
import { controlPlaneJson } from "@/lib/enterprise/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "admin_dashboard.access");
  if (access instanceof NextResponse) return access;

  const csrfToken = createCsrfToken();
  const capabilities = ENTERPRISE_PERMISSIONS.filter((permission) =>
    authorizeEnterprise(access.context.principal, permission, {
      organizationId: access.context.organization.id,
    })
  );
  const response = controlPlaneJson({
    organization: {
      id: access.context.organization.id,
      name: access.context.organization.name,
      slug: access.context.organization.slug,
    },
    role: access.context.principal.role,
    capabilities,
    csrfToken,
  });
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions());
  return response;
}
