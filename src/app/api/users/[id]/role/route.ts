import { NextResponse, type NextRequest } from "next/server";

import { logDocumentationAuthEvent } from "@/lib/documentation-auth/audit";
import { isDocumentationRole } from "@/lib/documentation-auth/permissions";
import { requirePermission } from "@/lib/documentation-auth/session";
import { updateUserRole } from "@/lib/db/repository";
import { requireMutationCsrf } from "@/lib/enterprise/http";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const csrfError = requireMutationCsrf(request);
  if (csrfError) return csrfError;
  const session = await requirePermission("manage_users", request);
  if (session instanceof NextResponse) return session;

  const { id } = await context.params;
  let body: { role?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const role = body.role?.trim();
  if (!role || !isDocumentationRole(role)) {
    return NextResponse.json({ error: "Valid role is required" }, { status: 400 });
  }

  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  try {
    const user = await updateUserRole(id, role);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await logDocumentationAuthEvent({
      action: "auth.user_role_changed",
      userId: session.user.id,
      actorEmail: session.user.email,
      metadata: { targetUserId: id, role },
    });

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 }
    );
  }
}
