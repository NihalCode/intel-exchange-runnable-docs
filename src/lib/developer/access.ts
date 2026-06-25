/** Verify developer/admin bearer token for protected workflows. */
export function developerAccessToken(): string | undefined {
  return process.env.DEVELOPER_ACCESS_TOKEN?.trim() || undefined;
}

export function isDeveloperAccessConfigured(): boolean {
  return Boolean(developerAccessToken());
}

export function verifyDeveloperRequest(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = developerAccessToken();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error:
        "Developer access is not configured. Set DEVELOPER_ACCESS_TOKEN in server environment.",
    };
  }

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerToken = req.headers.get("x-developer-token")?.trim() ?? "";
  const token = bearer || headerToken;

  if (!token || token !== expected) {
    return { ok: false, status: 401, error: "Invalid or missing developer access token." };
  }

  return { ok: true };
}

export function requireDeveloperAccess(req: Request): Response | null {
  const result = verifyDeveloperRequest(req);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: result.status });
  }
  return null;
}
