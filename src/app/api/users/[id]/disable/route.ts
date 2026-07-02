import { NextResponse, type NextRequest } from "next/server";

import { logDocumentationAuthEvent } from "@/lib/documentation-auth/audit";
import { requirePermission } from "@/lib/documentation-auth/session";
import { disableUser } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission("manage_users", request);
  if (session instanceof NextResponse) return session;

  const { id } = await context.params;
  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot disable your own account" }, { status: 400 });
  }

  try {
    const user = await disableUser(id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await logDocumentationAuthEvent({
      action: "auth.user_disabled",
      userId: session.user.id,
      actorEmail: session.user.email,
      metadata: { targetUserId: id },
    });

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 }
    );
  }
}
