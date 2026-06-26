import { requireDeveloperAccess } from "@/lib/developer/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CommitBody {
  title?: string;
  summary?: string;
  files?: { path: string; code: string }[];
}

/** POST — prepare (or optionally execute) a git commit for generated agent files. */
export async function POST(req: Request) {
  const denied = requireDeveloperAccess(req);
  if (denied) return denied;

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
