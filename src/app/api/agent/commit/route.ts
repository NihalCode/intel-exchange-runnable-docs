import { guardAgentFeature } from "@/lib/documentation-auth/guard-api";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { checkRateLimit } from "@/lib/documentation-auth/rate-limit";
import { requireMutationCsrf } from "@/lib/enterprise/http";
import { safeZipEntryPath } from "@/lib/security/safe-zip-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CommitBody {
  title?: string;
  summary?: string;
  files?: { path: string; code: string }[];
}

/** POST — prepare (or optionally execute) a git commit for generated agent files. */
export async function POST(req: Request) {
  const session = await guardAgentFeature(
    req as import("next/server").NextRequest,
    "git_commit"
  );
  if (session instanceof Response) return session;

  if (isAuthEnabled()) {
    const csrfFailure = requireMutationCsrf(req as import("next/server").NextRequest);
    if (csrfFailure) return csrfFailure;
  }
  if (!checkRateLimit(`agent-commit:${session.user.id}`, 10, 60_000)) {
    return Response.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  let body: CommitBody;
  try {
    body = (await req.json()) as CommitBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const files = body.files ?? [];
  if (files.length === 0) {
    return Response.json({ ok: false, error: "No files to commit." }, { status: 400 });
  }
  for (const file of files) {
    if (!safeZipEntryPath(String(file.path ?? ""))) {
      return Response.json({ ok: false, error: "Invalid file path." }, { status: 400 });
    }
  }

  const suggestedMessage =
    body.summary?.trim() ||
    `Agent export: ${body.title?.trim() || "Cyware integration app"} (${files.length} files)`;

  const gitEnabled = process.env.ENABLE_AGENT_GIT_COMMIT === "true";

  if (!gitEnabled) {
    return Response.json({
      ok: true,
      committed: false,
      preview: true,
      suggestedMessage,
      fileCount: files.length,
      changedPaths: files.map((f) => f.path),
      message:
        "Commit preview ready. Set ENABLE_AGENT_GIT_COMMIT=true on a developer machine with git access to commit automatically, or download the project zip and commit locally.",
    });
  }

  return Response.json({
    ok: true,
    committed: false,
    preview: true,
    suggestedMessage,
    fileCount: files.length,
    changedPaths: files.map((f) => f.path),
    message:
      "Git commit is enabled for this environment but must be run from your local developer setup. Use the suggested message and changed file list, or download the zip from the agent panel.",
  });
}
